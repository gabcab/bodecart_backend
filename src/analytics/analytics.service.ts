import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(bodegaId: string) {
    // Verify bodega exists
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Aggregate queries
    const [
      totalOrders,
      totalRevenue,
      todayOrders,
      todayRevenue,
      pendingOrders,
      totalProducts,
      lowStockProducts,
    ] = await Promise.all([
      // Total orders
      this.prisma.order.count({
        where: {
          bodegaId,
          status: OrderStatus.DELIVERED,
        },
      }),
      // Total revenue
      this.prisma.order.aggregate({
        where: {
          bodegaId,
          status: OrderStatus.DELIVERED,
        },
        _sum: { total: true },
      }),
      // Today's orders
      this.prisma.order.count({
        where: {
          bodegaId,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
      // Today's revenue
      this.prisma.order.aggregate({
        where: {
          bodegaId,
          status: OrderStatus.DELIVERED,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        _sum: { total: true },
      }),
      // Pending orders
      this.prisma.order.count({
        where: {
          bodegaId,
          status: {
            in: [OrderStatus.PLACED, OrderStatus.PENDING_STORE_CONFIRMATION, OrderStatus.ACCEPTED, OrderStatus.PREPARING],
          },
        },
      }),
      // Total products
      this.prisma.product.count({
        where: { bodegaId },
      }),
      // Low stock products (stock < 10)
      this.prisma.product.count({
        where: {
          bodegaId,
          stock: { lt: 10 },
        },
      }),
    ]);

    return {
      totalOrders,
      totalRevenue: Number(totalRevenue._sum.total || 0),
      todayOrders,
      todayRevenue: Number(todayRevenue._sum.total || 0),
      pendingOrders,
      totalProducts,
      lowStockProducts,
    };
  }

  async getSalesChartData(bodegaId: string, startDate: string, endDate: string) {
    // Verify bodega exists
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    const orders = await this.prisma.order.findMany({
      where: {
        bodegaId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      select: {
        createdAt: true,
        total: true,
        subtotal: true,
        deliveryFee: true,
        tax: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const salesByDate = orders.reduce(
      (acc, order) => {
        const date = order.createdAt.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            date,
            revenue: 0,
            orders: 0,
          };
        }
        acc[date].revenue += Number(order.total);
        acc[date].orders += 1;
        return acc;
      },
      {} as Record<string, { date: string; revenue: number; orders: number }>,
    );

    return Object.values(salesByDate);
  }

  async getTopProducts(bodegaId: string, limit: number = 10) {
    // Verify bodega exists
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    // Get top products by quantity sold
    const topProducts = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          bodegaId,
          status: OrderStatus.DELIVERED,
        },
      },
      _sum: {
        quantity: true,
        subtotal: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: limit,
    });

    // Get product details
    const productIds = topProducts.map((p) => p.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        price: true,
        images: true,
      },
    });

    // Combine data
    return topProducts.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return {
        productId: item.productId,
        productName: product?.name || 'Unknown',
        productImage: product?.images?.[0] || null,
        price: Number(product?.price || 0),
        soldCount: item._sum.quantity || 0,
        revenue: Number(item._sum.subtotal || 0),
      };
    });
  }

  async exportSalesReport(
    bodegaId: string,
    startDate: string,
    endDate: string,
    format: 'csv' | 'pdf' = 'csv',
  ) {
    // Verify bodega exists
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    // Get orders data
    const orders = await this.prisma.order.findMany({
      where: {
        bodegaId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
              },
            },
          },
        },
        client: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      // Generate CSV
      let csv = 'Order Number,Date,Client,Items,Subtotal,Tax,Delivery Fee,Total\n';

      for (const order of orders) {
        const date = order.createdAt.toISOString().split('T')[0];
        const client = `${order.client.user.firstName} ${order.client.user.lastName}`;
        const items = order.items.length;
        const subtotal = Number(order.subtotal);
        const tax = Number(order.tax || 0);
        const deliveryFee = Number(order.deliveryFee || 0);
        const total = Number(order.total);

        csv += `${order.orderNumber},${date},${client},${items},${subtotal.toFixed(2)},${tax.toFixed(2)},${deliveryFee.toFixed(2)},${total.toFixed(2)}\n`;
      }

      return csv;
    }

    // For PDF format, return JSON (frontend can use a PDF library to generate)
    return orders;
  }
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MapsService } from '../common/maps/maps.service';
import { CurrencyService } from '../common/currency/currency.service';
import { CreateOrderDto } from './dtos/create-order.dto';
import { UpdateOrderStatusDto } from './dtos/update-order-status.dto';
import { OrderStatus, UserRole, EarningType, PaymentStatus } from '@prisma/client';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private mapsService: MapsService,
    private currencyService: CurrencyService,
    private websocketGateway: WebsocketGateway,
    private notificationsService: NotificationsService,
  ) { }

  async create(createOrderDto: CreateOrderDto, userId: string) {
    const { bodegaId, addressId, items, specialInstructions, discount = 0 } = createOrderDto;

    // Get client
    const client = await this.prisma.client.findUnique({
      where: { userId },
    });

    if (!client) {
      throw new ForbiddenException('Only clients can create orders');
    }

    // Verify address belongs to client
    const address = await this.prisma.address.findFirst({
      where: {
        id: addressId,
        clientId: client.id,
      },
    });

    if (!address) {
      throw new NotFoundException('Address not found or does not belong to you');
    }

    // Verify bodega exists
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    if (!bodega.isOpen) {
      throw new BadRequestException('Bodega is currently closed');
    }

    // Get products and calculate totals
    const productIds = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        bodegaId,
      },
      include: {
        bundleItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (products.length !== items.length) {
      throw new BadRequestException('Some products not found or do not belong to this bodega');
    }

    // Check stock availability and calculate subtotal
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);

      if (!product) {
        throw new BadRequestException(`Product ${item.productId} not found`);
      }

      if (!product.isAvailable) {
        throw new BadRequestException(`Product ${product.name} is not available`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.name}. Available: ${product.stock}`,
        );
      }

      const price = product.discountPrice || product.price;
      const itemSubtotal = price * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: price,
        subtotal: itemSubtotal,
        productName: product.name,
        productImage: product.images[0] || null,
        isBundle: product.isBundle,
        bundleItems: product.isBundle && product.bundleItems
          ? product.bundleItems.map((bi) => ({
              productId: bi.productId,
              productName: bi.product.name,
              quantity: bi.quantity,
            }))
          : null,
      });
    }

    // Fetch system settings for fees
    const settings = await this.prisma.systemSettings.findFirst();
    const baseDeliveryFee = settings?.baseDeliveryFee ?? 2.99;
    const perKmDeliveryFee = settings?.perKmDeliveryFee ?? 0.5;
    const taxRate = (settings?.taxRate ?? 8.0) / 100;

    // Calculate distance-based delivery fee
    const distance = this.mapsService.calculateDistance(
      { latitude: bodega.latitude, longitude: bodega.longitude },
      { latitude: address.latitude, longitude: address.longitude },
    );
    const deliveryFee = parseFloat((baseDeliveryFee + distance * perKmDeliveryFee).toFixed(2));

    const tax = parseFloat((subtotal * taxRate).toFixed(2));
    const total = parseFloat((subtotal + deliveryFee + tax - discount).toFixed(2));

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Calculate display amounts in the bodega's local currency
    const displayCurrency = CurrencyService.getCurrencyForCountry(bodega.country);
    const exchangeRate = this.currencyService.getRate(displayCurrency);
    const displaySubtotal = displayCurrency !== 'USD'
      ? this.currencyService.fromUsd(subtotal, displayCurrency)
      : subtotal;
    const displayDeliveryFee = displayCurrency !== 'USD'
      ? this.currencyService.fromUsd(deliveryFee, displayCurrency)
      : deliveryFee;
    const displayTotal = displayCurrency !== 'USD'
      ? this.currencyService.fromUsd(total, displayCurrency)
      : total;

    // Create order with items
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        clientId: client.id,
        bodegaId,
        addressId,
        status: OrderStatus.PLACED,
        subtotal,
        deliveryFee,
        tax,
        discount,
        total,
        displayCurrency,
        exchangeRate,
        displaySubtotal,
        displayDeliveryFee,
        displayTotal,
        specialInstructions,
        items: {
          create: orderItems,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        bodega: true,
        address: true,
        client: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    // Decrease product stock
    for (const item of items) {
      await this.prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      });
    }

    this.logger.log(`Order created: ${order.orderNumber} (awaiting payment)`);

    // NOTE: Notifications are NOT sent here. They are sent AFTER payment is confirmed
    // in PaymentsService.confirmStripePayment() / confirmPayPalPayment().
    // This prevents notifying bodegueros and repartidores for orders that fail to pay.

    return order;
  }

  async findAll(userId: string, userRole: UserRole, page: number = 1, limit: number = 20, status?: string, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    // Apply status filter if provided
    if (status) {
      where.status = status;
    }

    // Apply search filter on orderNumber if provided
    if (search) {
      where.orderNumber = { contains: search, mode: 'insensitive' };
    }

    if (userRole === UserRole.CLIENT) {
      const client = await this.prisma.client.findUnique({
        where: { userId },
      });
      if (client) where.clientId = client.id;
    } else if (userRole === UserRole.BODEGA_OWNER) {
      const bodegaOwner = await this.prisma.bodegaOwner.findUnique({
        where: { userId },
        include: { bodegas: true },
      });
      if (bodegaOwner) {
        where.bodegaId = { in: bodegaOwner.bodegas.map((b) => b.id) };
        // Only show orders with confirmed payment (hide unpaid PLACED orders)
        if (!status) {
          where.OR = [
            { payment: { status: PaymentStatus.COMPLETED } },
            { status: { notIn: [OrderStatus.PLACED] } },
          ];
        }
      }
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          bodega: true,
          address: true,
          client: {
            include: {
              user: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
            },
          },
          delivery: {
            include: {
              deliveryPerson: {
                include: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      phone: true,
                    },
                  },
                },
              },
            },
          },
          payment: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId: string, userRole: UserRole) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        bodega: {
          include: {
            owner: {
              include: {
                user: true,
              },
            },
          },
        },
        address: true,
        client: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        delivery: {
          include: {
            deliveryPerson: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check access permissions
    if (userRole === UserRole.CLIENT) {
      const client = await this.prisma.client.findUnique({
        where: { userId },
      });
      if (order.clientId !== client?.id) {
        throw new ForbiddenException('You can only view your own orders');
      }
    } else if (userRole === UserRole.BODEGA_OWNER) {
      if (order.bodega.owner.userId !== userId) {
        throw new ForbiddenException('You can only view orders for your bodegas');
      }
    }

    return order;
  }

  async updateStatus(
    id: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
    userId: string,
    userRole: UserRole,
  ) {
    const { status, reason } = updateOrderStatusDto;

    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        bodega: {
          include: {
            owner: {
              include: { user: true },
            },
          },
        },
        client: {
          include: { user: true },
        },
        payment: true,
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Validate status transitions
    this.validateStatusTransition(order.status, status);

    // Check permissions based on role and status
    if (userRole === UserRole.BODEGA_OWNER) {
      if (order.bodega.owner.userId !== userId) {
        throw new ForbiddenException('You can only update orders for your bodegas');
      }

      // Bodegueros can only move to ACCEPTED, PREPARING, READY_FOR_PICKUP
      const allowedStatuses = [
        OrderStatus.ACCEPTED,
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.CANCELLED,
      ] as const;
      if (!(allowedStatuses as readonly OrderStatus[]).includes(status)) {
        throw new ForbiddenException(`Bodega owners cannot set status to ${status}`);
      }
    } else if (userRole === UserRole.CLIENT) {
      const client = await this.prisma.client.findUnique({
        where: { userId },
      });
      if (order.clientId !== client?.id) {
        throw new ForbiddenException('You can only update your own orders');
      }

      // Clients can only cancel
      if (status !== OrderStatus.CANCELLED) {
        throw new ForbiddenException('Clients can only cancel orders');
      }

      // Can only cancel if PENDING or ACCEPTED
      const cancellableStatuses = [OrderStatus.PLACED, OrderStatus.ACCEPTED] as const;
      if (!(cancellableStatuses as readonly OrderStatus[]).includes(order.status)) {
        throw new BadRequestException('Order cannot be cancelled at this stage');
      }
    }

    // Check payment status for ACCEPTED transition
    if (status === OrderStatus.ACCEPTED) {
      if (!order.payment || order.payment.status !== 'COMPLETED') {
        throw new BadRequestException('Payment must be completed before accepting order');
      }
    }

    // Update order
    const updateData: any = { status };

    if (status === OrderStatus.ACCEPTED) {
      updateData.acceptedAt = new Date();
    } else if (status === OrderStatus.DELIVERED) {
      updateData.completedAt = new Date();
    } else if (status === OrderStatus.CANCELLED) {
      updateData.cancelledAt = new Date();
      updateData.cancellationReason = reason;

      // Restore product stock if cancelled
      for (const item of order.items) {
        await this.prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity,
            },
          },
        });
      }

      // Cancel associated delivery if exists
      if (order.deliveryId) {
        await this.prisma.delivery.update({
          where: { id: order.deliveryId },
          data: { status: 'CANCELLED' },
        });
        this.logger.log(`Delivery ${order.deliveryId} cancelled (order ${order.orderNumber} cancelled)`);

        // Notify the delivery person via WebSocket
        const delivery = await this.prisma.delivery.findUnique({
          where: { id: order.deliveryId },
          include: { deliveryPerson: { include: { user: true } } },
        });
        if (delivery) {
          this.websocketGateway.emitOrderStatusUpdate(id, OrderStatus.CANCELLED, { ...order, status: OrderStatus.CANCELLED });
        }

        // Delete any earnings created for this order
        await this.prisma.earning.deleteMany({
          where: { orderId: id },
        });
      }
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        bodega: {
          include: {
            owner: true,
          },
        },
        address: true,
        client: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        delivery: {
          include: {
            deliveryPerson: true,
          },
        },
        payment: true,
      },
    });

    this.logger.log(`Order ${order.orderNumber} status updated to ${status}`);

    // If order moved to READY_FOR_PICKUP and already has a delivery person assigned,
    // automatically advance to PICKING_UP
    if (status === OrderStatus.READY_FOR_PICKUP && updatedOrder.deliveryId) {
      await this.prisma.order.update({
        where: { id },
        data: { status: OrderStatus.PICKING_UP },
      });
      updatedOrder.status = OrderStatus.PICKING_UP;
      this.websocketGateway.emitOrderStatusUpdate(order.id, OrderStatus.PICKING_UP, updatedOrder);
      this.logger.log(`Order ${order.orderNumber} auto-advanced to PICKING_UP (delivery already assigned)`);
    }

    // Auto-create earning records when an order is delivered
    if (status === OrderStatus.DELIVERED) {
      await this.createEarningsForDeliveredOrder(updatedOrder).catch((err) => {
        this.logger.error(
          `Failed to create earnings for order ${order.orderNumber}: ${err.message}`,
          err.stack,
        );
      });
    }

    // Emit real-time update to subscribed clients
    this.websocketGateway.emitOrderStatusUpdate(order.id, status, updatedOrder);

    // Push notification to client about status change (fire-and-forget)
    this.notificationsService.notifyOrderStatusChanged(order.id, status).catch((err) => {
      this.logger.error(`Failed to send push for order status change ${order.orderNumber}: ${err.message}`);
    });

    // When order is READY_FOR_PICKUP, also push to available delivery persons
    if (status === OrderStatus.READY_FOR_PICKUP) {
      this.notificationsService.notifyNewOrderForDelivery(order.id).catch((err) => {
        this.logger.error(`Failed to notify delivery persons for ready order ${order.orderNumber}: ${err.message}`);
      });
    }

    return updatedOrder;
  }

  /**
   * Creates Earning records for a delivered order.
   * Reads commission rates from SystemSettings (falls back to defaults if not found).
   *
   * Created records:
   *  - ORDER_SALE  → bodeguero gets subtotal minus platform commission
   *  - DELIVERY_FEE → repartidor gets delivery.fee * deliveryPersonCommission%
   *  - TIP (if > 0) → repartidor keeps 100% of tip
   */
  private async createEarningsForDeliveredOrder(order: any): Promise<void> {
    // Fetch commission settings; use schema defaults if the row does not exist yet
    const settings = await this.prisma.systemSettings.findFirst();
    const platformCommissionPct = settings?.platformCommission ?? 10.0;
    const deliveryPersonCommissionPct = settings?.deliveryPersonCommission ?? 80.0;

    const bodegaOwnerId: string | undefined = order.bodega?.owner?.id;
    const delivery = order.delivery;
    const deliveryPersonId: string | undefined = delivery?.deliveryPerson?.id;

    const earningsToCreate: Array<{
      orderId: string;
      bodegaOwnerId?: string;
      deliveryPersonId?: string;
      type: EarningType;
      amount: number;
      platformFee: number;
      netAmount: number;
    }> = [];

    // --- ORDER_SALE for bodeguero ---
    if (bodegaOwnerId) {
      const amount = order.subtotal as number;
      const platformFee = parseFloat((amount * (platformCommissionPct / 100)).toFixed(2));
      const netAmount = parseFloat((amount - platformFee).toFixed(2));

      earningsToCreate.push({
        orderId: order.id,
        bodegaOwnerId,
        type: EarningType.ORDER_SALE,
        amount,
        platformFee,
        netAmount,
      });
    }

    // --- DELIVERY_FEE for repartidor ---
    if (deliveryPersonId && delivery?.fee != null) {
      const amount = delivery.fee as number;
      // Platform keeps (100 - deliveryPersonCommissionPct)% of the fee
      const platformFee = parseFloat(
        (amount * ((100 - deliveryPersonCommissionPct) / 100)).toFixed(2),
      );
      const netAmount = parseFloat((amount * (deliveryPersonCommissionPct / 100)).toFixed(2));

      earningsToCreate.push({
        orderId: order.id,
        deliveryPersonId,
        type: EarningType.DELIVERY_FEE,
        amount,
        platformFee,
        netAmount,
      });

      // --- TIP for repartidor (100% goes to them) ---
      const tip = delivery.tip as number;
      if (tip > 0) {
        earningsToCreate.push({
          orderId: order.id,
          deliveryPersonId,
          type: EarningType.TIP,
          amount: tip,
          platformFee: 0,
          netAmount: tip,
        });
      }
    }

    if (earningsToCreate.length === 0) {
      this.logger.warn(
        `No earnings created for order ${order.id}: missing bodegaOwner or deliveryPerson relations`,
      );
      return;
    }

    // Use createMany for atomicity; skipDuplicates prevents double-creation on retries
    await this.prisma.earning.createMany({
      data: earningsToCreate,
      skipDuplicates: true,
    });

    this.logger.log(
      `Created ${earningsToCreate.length} earning record(s) for order ${order.id} ` +
        `(platform commission: ${platformCommissionPct}%, delivery commission: ${deliveryPersonCommissionPct}%)`,
    );
  }

  async cancel(id: string, userId: string, userRole: UserRole, reason?: string) {
    return this.updateStatus(id, { status: OrderStatus.CANCELLED, reason }, userId, userRole);
  }

  private validateStatusTransition(currentStatus: OrderStatus, newStatus: OrderStatus) {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PLACED]: [OrderStatus.PENDING_STORE_CONFIRMATION, OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
      [OrderStatus.PENDING_STORE_CONFIRMATION]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
      [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING]: [OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED, OrderStatus.DELAYED],
      [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.COURIER_ASSIGNED, OrderStatus.CANCELLED, OrderStatus.DELAYED],
      [OrderStatus.COURIER_ASSIGNED]: [OrderStatus.PICKING_UP, OrderStatus.CANCELLED],
      [OrderStatus.PICKING_UP]: [OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED],
      [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED, OrderStatus.DELAYED],
      [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
      [OrderStatus.PARTIALLY_CANCELLED]: [OrderStatus.REFUNDED],
      [OrderStatus.CANCELLED]: [OrderStatus.REFUNDED],
      [OrderStatus.DELAYED]: [OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED],
      [OrderStatus.REFUNDED]: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  async getOrderStats(userId: string, userRole: UserRole) {
    const where: any = {};

    if (userRole === UserRole.CLIENT) {
      const client = await this.prisma.client.findUnique({
        where: { userId },
      });
      if (client) where.clientId = client.id;
    } else if (userRole === UserRole.BODEGA_OWNER) {
      const bodegaOwner = await this.prisma.bodegaOwner.findUnique({
        where: { userId },
        include: { bodegas: true },
      });
      if (bodegaOwner) {
        where.bodegaId = { in: bodegaOwner.bodegas.map((b) => b.id) };
      }
    }

    const [total, pending, active, completed, cancelled] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.PLACED } }),
      this.prisma.order.count({
        where: {
          ...where,
          status: {
            in: [
              OrderStatus.ACCEPTED,
              OrderStatus.PREPARING,
              OrderStatus.READY_FOR_PICKUP,
              OrderStatus.PICKING_UP,
              OrderStatus.ON_THE_WAY,
            ],
          },
        },
      }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.DELIVERED } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.CANCELLED } }),
    ]);

    return {
      total,
      pending,
      active,
      completed,
      cancelled,
    };
  }
}

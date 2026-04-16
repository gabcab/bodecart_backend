import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StripeProvider } from '../payments/providers/stripe.provider';
import {
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  VerifyBodegaDto,
  SuspendBodegaDto,
  UpdateSystemSettingsDto,
} from './dtos';
import { UserRole, UserStatus, DocumentStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private stripeProvider: StripeProvider,
  ) {}

  // ============================================
  // GLOBAL STATISTICS
  // ============================================

  async getGlobalStats() {
    const [
      totalUsers,
      totalClients,
      totalBodegaOwners,
      totalDeliveryPersons,
      totalBodegas,
      verifiedBodegas,
      totalOrders,
      activeOrders,
      totalRevenue,
      pendingBodegaDocuments,
      pendingDeliveryDocuments,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { roles: { has: UserRole.CLIENT } } }),
      this.prisma.user.count({ where: { roles: { has: UserRole.BODEGA_OWNER } } }),
      this.prisma.user.count({ where: { roles: { has: UserRole.DELIVERY_PERSON } } }),
      this.prisma.bodega.count(),
      this.prisma.bodega.count({ where: { isVerified: true } }),
      this.prisma.order.count(),
      this.prisma.order.count({
        where: {
          status: {
            in: [
              OrderStatus.PLACED,
              OrderStatus.PENDING_STORE_CONFIRMATION,
              OrderStatus.ACCEPTED,
              OrderStatus.PREPARING,
              OrderStatus.READY_FOR_PICKUP,
              OrderStatus.COURIER_ASSIGNED,
              OrderStatus.PICKING_UP,
              OrderStatus.ON_THE_WAY,
            ],
          },
        },
      }),
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: { status: OrderStatus.DELIVERED },
      }),
      this.prisma.bodegaDocument.count({
        where: { status: DocumentStatus.PENDING },
      }),
      this.prisma.deliveryPersonDocument.count({
        where: { status: DocumentStatus.PENDING },
      }),
    ]);

    const pendingDocuments = pendingBodegaDocuments + pendingDeliveryDocuments;

    return {
      totalUsers,
      totalClients,
      totalBodegueros: totalBodegaOwners, // Frontend expects 'totalBodegueros'
      totalDeliveryPersons,
      totalBodegas,
      verifiedBodegas,
      totalOrders,
      activeOrders,
      totalRevenue: totalRevenue._sum.total || 0,
      pendingDocuments,
    };
  }

  // ============================================
  // ANALYTICS
  // ============================================

  async getAnalytics(params?: { startDate?: string; endDate?: string }) {
    const where = {};
    if (params?.startDate && params?.endDate) {
      where['createdAt'] = {
        gte: new Date(params.startDate),
        lte: new Date(params.endDate),
      };
    }

    // Revenue chart data (group by day)
    const orders = await this.prisma.order.findMany({
      where: {
        ...where,
        status: OrderStatus.DELIVERED,
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
    const revenueByDate = orders.reduce((acc, order) => {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          date,
          revenue: 0,
          orders: 0,
          deliveryFees: 0,
          taxes: 0,
        };
      }
      acc[date].revenue += Number(order.total);
      acc[date].orders += 1;
      acc[date].deliveryFees += Number(order.deliveryFee || 0);
      acc[date].taxes += Number(order.tax || 0);
      return acc;
    }, {});

    const revenueChart = Object.values(revenueByDate);

    // Orders by status
    const ordersByStatus = await this.prisma.order.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const ordersStatusChart = ordersByStatus.map((item) => ({
      status: item.status,
      count: item._count.status,
    }));

    // Top bodegas
    const topBodegas = await this.prisma.bodega.findMany({
      where: { isVerified: true },
      select: {
        id: true,
        name: true,
        _count: {
          select: { orders: true },
        },
        orders: {
          where: { status: OrderStatus.DELIVERED },
          select: { total: true },
        },
      },
      orderBy: {
        orders: { _count: 'desc' },
      },
      take: 10,
    });

    const topBodegasData = topBodegas.map((bodega) => ({
      bodegaId: bodega.id,
      bodegaName: bodega.name,
      totalOrders: bodega._count.orders,
      revenue: bodega.orders.reduce((sum, o) => sum + Number(o.total), 0),
    }));

    // Top products
    const topProducts = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          ...where,
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
      take: 10,
    });

    const productIds = topProducts.map((p) => p.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });

    const topProductsData = topProducts.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return {
        productId: item.productId,
        productName: product?.name || 'Unknown',
        soldCount: item._sum.quantity || 0,
        revenue: Number(item._sum.subtotal || 0),
      };
    });

    // User growth (group by date)
    const users = await this.prisma.user.findMany({
      where,
      select: { createdAt: true, roles: true },
      orderBy: { createdAt: 'asc' },
    });

    const userGrowthByDate = users.reduce((acc, user) => {
      const date = user.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { date, clients: 0, bodegueros: 0, deliveryPersons: 0 };
      }
      if (user.roles.includes(UserRole.CLIENT)) acc[date].clients += 1;
      if (user.roles.includes(UserRole.BODEGA_OWNER)) acc[date].bodegueros += 1;
      if (user.roles.includes(UserRole.DELIVERY_PERSON)) acc[date].deliveryPersons += 1;
      return acc;
    }, {});

    const userGrowthChart = Object.values(userGrowthByDate);

    return {
      revenueChart,
      ordersStatusChart,
      topBodegas: topBodegasData,
      topProducts: topProductsData,
      userGrowthChart,
    };
  }

  // ============================================
  // BODEGAS MANAGEMENT
  // ============================================

  async getAdminBodegas(params?: {
    search?: string;
    isVerified?: boolean;
    ownerId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params?.isVerified !== undefined) {
      where.isVerified = params.isVerified;
    }

    if (params?.ownerId) {
      where.ownerId = params.ownerId;
    }

    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { street: { contains: params.search, mode: 'insensitive' } },
        { city: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [bodegas, total] = await Promise.all([
      this.prisma.bodega.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
            },
          },
          _count: {
            select: {
              products: true,
              orders: true,
            },
          },
        },
      }),
      this.prisma.bodega.count({ where }),
    ]);

    return {
      bodegas,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // DELIVERY PERSONS MANAGEMENT
  // ============================================

  async getDeliveryPersons(params?: {
    search?: string;
    isVerified?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params?.isVerified !== undefined) {
      where.isVerified = params.isVerified;
    }

    if (params?.search) {
      where.user = {
        OR: [
          { email: { contains: params.search, mode: 'insensitive' } },
          { firstName: { contains: params.search, mode: 'insensitive' } },
          { lastName: { contains: params.search, mode: 'insensitive' } },
        ],
      };
    }

    const [deliveryPersons, total] = await Promise.all([
      this.prisma.deliveryPerson.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              status: true,
              avatar: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              deliveries: true,
              documents: true,
              reviews: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.deliveryPerson.count({ where }),
    ]);

    return {
      deliveryPersons,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDeliveryPerson(id: string) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
            avatar: true,
            createdAt: true,
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            deliveries: true,
            documents: true,
            reviews: true,
          },
        },
      },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Delivery person not found');
    }

    // Delivery stats
    const [completedDeliveries, totalEarnings] = await Promise.all([
      this.prisma.delivery.count({
        where: {
          deliveryPersonId: id,
          status: 'DELIVERED',
        },
      }),
      this.prisma.earning.aggregate({
        where: { deliveryPersonId: id },
        _sum: { amount: true },
      }),
    ]);

    return {
      ...deliveryPerson,
      stats: {
        completedDeliveries,
        totalEarnings: totalEarnings._sum.amount || 0,
      },
    };
  }

  async verifyDeliveryPerson(id: string, isVerified: boolean) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Delivery person not found');
    }

    const updated = await this.prisma.deliveryPerson.update({
      where: { id },
      data: {
        isVerified,
        verifiedAt: isVerified ? new Date() : null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Notify the delivery person
    await this.prisma.notification.create({
      data: {
        userId: deliveryPerson.userId,
        title: isVerified ? 'Account Verified' : 'Verification Revoked',
        body: isVerified
          ? 'Your delivery account has been verified. You can now accept deliveries!'
          : 'Your delivery account verification has been revoked. Please contact support.',
        type: 'VERIFICATION',
      },
    });

    return updated;
  }

  // ============================================
  // DOCUMENTS MANAGEMENT
  // ============================================

  async getDocuments(params?: {
    userType?: 'bodega' | 'delivery' | 'all';
    status?: DocumentStatus;
    type?: string;
    bodegaId?: string;
    deliveryPersonId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;
    const userType = params?.userType || 'all';

    // Build where clauses for each document type
    const bodegaWhere: any = {};
    const deliveryWhere: any = {};

    if (params?.status) {
      bodegaWhere.status = params.status;
      deliveryWhere.status = params.status;
    }
    if (params?.type) {
      bodegaWhere.type = params.type;
      deliveryWhere.type = params.type;
    }
    if (params?.bodegaId) {
      bodegaWhere.bodegaId = params.bodegaId;
    }
    if (params?.deliveryPersonId) {
      deliveryWhere.deliveryPersonId = params.deliveryPersonId;
    }

    let normalizedBodegaDocs: any[] = [];
    let normalizedDeliveryDocs: any[] = [];
    let bodegaTotal = 0;
    let deliveryTotal = 0;

    // Determine which document types to fetch based on filters
    // If deliveryPersonId is provided, only fetch delivery documents
    // If bodegaId is provided, only fetch bodega documents
    const shouldFetchBodega = !params?.deliveryPersonId && (userType === 'all' || userType === 'bodega');
    const shouldFetchDelivery = !params?.bodegaId && (userType === 'all' || userType === 'delivery');

    // Fetch bodega documents only if appropriate
    if (shouldFetchBodega) {
      const [bodegaDocs, count] = await Promise.all([
        this.prisma.bodegaDocument.findMany({
          where: bodegaWhere,
          include: {
            bodega: {
              select: {
                id: true,
                name: true,
                owner: {
                  select: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
            reviewedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.bodegaDocument.count({ where: bodegaWhere }),
      ]);

      bodegaTotal = count;
      normalizedBodegaDocs = bodegaDocs.map((doc) => ({
        ...doc,
        documentSource: 'bodega' as const,
        ownerName: doc.bodega?.name || 'Unknown Bodega',
        uploadedAt: doc.createdAt,
      }));
    }

    // Fetch delivery person documents only if appropriate
    if (shouldFetchDelivery) {
      const [deliveryDocs, count] = await Promise.all([
        this.prisma.deliveryPersonDocument.findMany({
          where: deliveryWhere,
          include: {
            deliveryPerson: {
              select: {
                id: true,
                vehicleType: true,
                vehiclePlate: true,
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            reviewedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.deliveryPersonDocument.count({ where: deliveryWhere }),
      ]);

      deliveryTotal = count;
      normalizedDeliveryDocs = deliveryDocs.map((doc) => ({
        ...doc,
        documentSource: 'delivery' as const,
        ownerName: doc.deliveryPerson?.user
          ? `${doc.deliveryPerson.user.firstName} ${doc.deliveryPerson.user.lastName}`
          : 'Unknown Delivery Person',
        deliveryPerson: doc.deliveryPerson,
        uploadedAt: doc.createdAt,
      }));
    }

    // Combine and sort by createdAt
    const allDocuments = [...normalizedBodegaDocs, ...normalizedDeliveryDocs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = bodegaTotal + deliveryTotal;

    // Apply pagination to combined results
    const paginatedDocuments = allDocuments.slice(skip, skip + limit);

    return {
      documents: paginatedDocuments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // VERIFICATION QUEUE
  // ============================================

  async getVerificationQueue(params?: {
    userType?: 'BODEGA_OWNER' | 'DELIVERY_PERSON' | 'ALL';
    status?: DocumentStatus | 'ALL';
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;
    const userType = params?.userType || 'ALL';
    const docStatus = params?.status === 'ALL' ? undefined : params?.status;

    // Only show users with pending documents who are NOT yet verified
    const bodegaOwnerWhere = {
      roles: { has: UserRole.BODEGA_OWNER },
      bodegaOwner: {
        bodegas: {
          some: {
            isVerified: false,
            documents: { some: { status: docStatus || DocumentStatus.PENDING } },
          },
        },
      },
    };

    const deliveryPersonWhere = {
      roles: { has: UserRole.DELIVERY_PERSON },
      deliveryPerson: {
        isVerified: false,
        documents: { some: { status: docStatus || DocumentStatus.PENDING } },
      },
    };

    const bodegaOwners =
      userType === 'BODEGA_OWNER' || userType === 'ALL'
        ? await this.prisma.user.findMany({
            where: bodegaOwnerWhere,
            include: {
              bodegaOwner: {
                include: {
                  bodegas: {
                    where: { isVerified: false },
                    include: {
                      documents: {
                        orderBy: { createdAt: 'desc' },
                      },
                    },
                  },
                },
              },
            },
            take: limit,
            skip,
          })
        : [];

    const deliveryPersons =
      userType === 'DELIVERY_PERSON' || userType === 'ALL'
        ? await this.prisma.user.findMany({
            where: deliveryPersonWhere,
            include: {
              deliveryPerson: {
                include: {
                  documents: {
                    orderBy: { createdAt: 'desc' },
                  },
                },
              },
            },
            take: limit,
            skip,
          })
        : [];

    const totalBodegaOwners =
      userType === 'BODEGA_OWNER' || userType === 'ALL'
        ? await this.prisma.user.count({ where: bodegaOwnerWhere })
        : 0;

    const totalDeliveryPersons =
      userType === 'DELIVERY_PERSON' || userType === 'ALL'
        ? await this.prisma.user.count({ where: deliveryPersonWhere })
        : 0;

    const total = totalBodegaOwners + totalDeliveryPersons;
    const users = [...bodegaOwners, ...deliveryPersons];

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserDocuments(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        bodegaOwner: {
          include: {
            bodegas: {
              include: {
                documents: {
                  include: {
                    bodega: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                    reviewedBy: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                      },
                    },
                  },
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
          },
        },
        deliveryPerson: {
          include: {
            documents: {
              include: {
                deliveryPerson: {
                  select: {
                    id: true,
                    vehicleType: true,
                    vehiclePlate: true,
                    vehicleColor: true,
                  },
                },
                reviewedBy: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Map bodega documents with uploadedAt alias
    const bodegaDocuments = user.bodegaOwner?.bodegas.flatMap((bodega) =>
      bodega.documents.map((doc) => ({
        ...doc,
        uploadedAt: doc.createdAt, // Alias for frontend compatibility
        reviewedBy: doc.reviewedBy
          ? `${doc.reviewedBy.firstName} ${doc.reviewedBy.lastName}`
          : null,
      })),
    ) || [];

    // Map delivery documents with uploadedAt alias
    const deliveryDocuments = user.deliveryPerson?.documents.map((doc) => ({
      ...doc,
      uploadedAt: doc.createdAt, // Alias for frontend compatibility
      reviewedBy: doc.reviewedBy
        ? `${doc.reviewedBy.firstName} ${doc.reviewedBy.lastName}`
        : null,
    })) || [];

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        status: user.status,
        createdAt: user.createdAt,
        avatar: user.avatar,
        bodegaOwner: user.bodegaOwner
          ? {
              firstName: user.firstName,
              lastName: user.lastName,
              bodegas: user.bodegaOwner.bodegas.map((b) => ({
                id: b.id,
                name: b.name,
              })),
            }
          : null,
        deliveryPerson: user.deliveryPerson
          ? {
              firstName: user.firstName,
              lastName: user.lastName,
              vehicleType: user.deliveryPerson.vehicleType,
              vehiclePlate: user.deliveryPerson.vehiclePlate,
            }
          : null,
      },
      documents: [...bodegaDocuments, ...deliveryDocuments],
    };
  }

  // ============================================
  // DOCUMENT APPROVAL/REJECTION
  // ============================================

  async approveDocument(documentId: string, adminId: string, documentType: 'bodega' | 'delivery') {
    if (documentType === 'bodega') {
      return this.approveBodegaDocument(documentId, adminId);
    } else {
      return this.approveDeliveryDocument(documentId, adminId);
    }
  }

  async rejectDocument(
    documentId: string,
    adminId: string,
    reason: string,
    documentType: 'bodega' | 'delivery',
  ) {
    if (documentType === 'bodega') {
      return this.rejectBodegaDocument(documentId, adminId, reason);
    } else {
      return this.rejectDeliveryDocument(documentId, adminId, reason);
    }
  }

  private async approveBodegaDocument(documentId: string, adminId: string) {
    const document = await this.prisma.bodegaDocument.findUnique({
      where: { id: documentId },
      include: {
        bodega: {
          include: {
            owner: { include: { user: true } },
            documents: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.status === DocumentStatus.APPROVED) {
      throw new BadRequestException('Document is already approved');
    }

    const updatedDocument = await this.prisma.bodegaDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: adminId,
        rejectionReason: null,
      },
    });

    const allDocuments = document.bodega.documents;
    const allApproved = allDocuments.every(
      (doc) => doc.id === documentId || doc.status === DocumentStatus.APPROVED,
    );

    if (allApproved && allDocuments.length > 0) {
      await this.prisma.bodega.update({
        where: { id: document.bodegaId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      await this.prisma.user.update({
        where: { id: document.bodega.owner.userId },
        data: { status: UserStatus.ACTIVE },
      });

      await this.prisma.notification.create({
        data: {
          userId: document.bodega.owner.userId,
          title: 'Bodega Verified',
          body: `Your bodega "${document.bodega.name}" has been verified and is now active!`,
          type: 'VERIFICATION',
          data: { bodegaId: document.bodegaId },
        },
      });
    } else {
      await this.prisma.notification.create({
        data: {
          userId: document.bodega.owner.userId,
          title: 'Document Approved',
          body: `Your ${document.type.replace(/_/g, ' ').toLowerCase()} document has been approved.`,
          type: 'VERIFICATION',
          data: { documentId },
        },
      });
    }

    return updatedDocument;
  }

  private async rejectBodegaDocument(documentId: string, adminId: string, reason: string) {
    const document = await this.prisma.bodegaDocument.findUnique({
      where: { id: documentId },
      include: {
        bodega: {
          include: { owner: { include: { user: true } } },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.status === DocumentStatus.REJECTED) {
      throw new BadRequestException('Document is already rejected');
    }

    const updatedDocument = await this.prisma.bodegaDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedById: adminId,
        rejectionReason: reason,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: document.bodega.owner.userId,
        title: 'Document Rejected',
        body: `Your ${document.type.replace(/_/g, ' ').toLowerCase()} document was rejected. Reason: ${reason}`,
        type: 'VERIFICATION',
        data: { documentId, reason },
      },
    });

    return updatedDocument;
  }

  private async approveDeliveryDocument(documentId: string, adminId: string) {
    const document = await this.prisma.deliveryPersonDocument.findUnique({
      where: { id: documentId },
      include: {
        deliveryPerson: {
          include: {
            user: true,
            documents: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.status === DocumentStatus.APPROVED) {
      throw new BadRequestException('Document is already approved');
    }

    const updatedDocument = await this.prisma.deliveryPersonDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: adminId,
        rejectionReason: null,
      },
    });

    const allDocuments = document.deliveryPerson.documents;
    const allApproved = allDocuments.every(
      (doc) => doc.id === documentId || doc.status === DocumentStatus.APPROVED,
    );

    if (allApproved && allDocuments.length > 0) {
      await this.prisma.deliveryPerson.update({
        where: { id: document.deliveryPersonId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      await this.prisma.user.update({
        where: { id: document.deliveryPerson.userId },
        data: { status: UserStatus.ACTIVE },
      });

      await this.prisma.notification.create({
        data: {
          userId: document.deliveryPerson.userId,
          title: 'Account Verified',
          body: 'Your delivery account has been verified and is now active!',
          type: 'VERIFICATION',
        },
      });
    } else {
      await this.prisma.notification.create({
        data: {
          userId: document.deliveryPerson.userId,
          title: 'Document Approved',
          body: `Your ${document.type.replace(/_/g, ' ').toLowerCase()} document has been approved.`,
          type: 'VERIFICATION',
          data: { documentId },
        },
      });
    }

    return updatedDocument;
  }

  private async rejectDeliveryDocument(documentId: string, adminId: string, reason: string) {
    const document = await this.prisma.deliveryPersonDocument.findUnique({
      where: { id: documentId },
      include: {
        deliveryPerson: {
          include: { user: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.status === DocumentStatus.REJECTED) {
      throw new BadRequestException('Document is already rejected');
    }

    const updatedDocument = await this.prisma.deliveryPersonDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedById: adminId,
        rejectionReason: reason,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: document.deliveryPerson.userId,
        title: 'Document Rejected',
        body: `Your ${document.type.replace(/_/g, ' ').toLowerCase()} document was rejected. Reason: ${reason}`,
        type: 'VERIFICATION',
        data: { documentId, reason },
      },
    });

    return updatedDocument;
  }

  // ============================================
  // SYSTEM SETTINGS
  // ============================================

  async getSystemSettings() {
    // Get the first (and only) settings record
    let settings = await this.prisma.systemSettings.findFirst();

    // If no settings exist, create default settings
    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {
          taxRate: 0.0,
          baseDeliveryFee: 2.99,
          perKmDeliveryFee: 0.5,
          platformCommission: 10.0,
          enabledPaymentMethods: ['CREDIT_CARD', 'DEBIT_CARD', 'CASH'],
          maintenanceMode: false,
        },
      });
    }

    return {
      taxRate: settings.taxRate,
      baseDeliveryFee: settings.baseDeliveryFee,
      perKmDeliveryFee: settings.perKmDeliveryFee,
      platformCommission: settings.platformCommission,
      enabledPaymentMethods: settings.enabledPaymentMethods,
      maintenanceMode: settings.maintenanceMode,
    };
  }

  async updateSystemSettings(dto: UpdateSystemSettingsDto) {
    // Get the first settings record
    let settings = await this.prisma.systemSettings.findFirst();

    if (!settings) {
      // Create if doesn't exist
      settings = await this.prisma.systemSettings.create({
        data: {
          taxRate: dto.taxRate ?? 0.0,
          baseDeliveryFee: dto.baseDeliveryFee ?? 2.99,
          perKmDeliveryFee: dto.perKmDeliveryFee ?? 0.5,
          platformCommission: dto.platformCommission ?? 10.0,
          enabledPaymentMethods: dto.enabledPaymentMethods ?? ['CREDIT_CARD', 'DEBIT_CARD', 'CASH'],
          maintenanceMode: dto.maintenanceMode ?? false,
        },
      });
    } else {
      // Update existing
      settings = await this.prisma.systemSettings.update({
        where: { id: settings.id },
        data: dto,
      });
    }

    return {
      taxRate: settings.taxRate,
      baseDeliveryFee: settings.baseDeliveryFee,
      perKmDeliveryFee: settings.perKmDeliveryFee,
      platformCommission: settings.platformCommission,
      enabledPaymentMethods: settings.enabledPaymentMethods,
      maintenanceMode: settings.maintenanceMode,
    };
  }

  // ============================================
  // STRIPE REVENUE & TRANSACTIONS
  // ============================================

  async getStripeRevenue() {
    return this.stripeProvider.getTotalRevenue();
  }

  async getStripeBalance() {
    const balance = await this.stripeProvider.getBalance();

    // Format the balance for easier consumption
    return {
      available: balance.available.map((b) => ({
        amount: b.amount / 100, // Convert from cents
        currency: b.currency,
      })),
      pending: balance.pending.map((b) => ({
        amount: b.amount / 100,
        currency: b.currency,
      })),
    };
  }

  async getStripeTransactions(params?: {
    limit?: number;
    startingAfter?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const limit = params?.limit || 50;

    // Build date filters
    const created: { gte?: number; lte?: number } | undefined =
      params?.startDate || params?.endDate
        ? {
            gte: params?.startDate
              ? Math.floor(new Date(params.startDate).getTime() / 1000)
              : undefined,
            lte: params?.endDate
              ? Math.floor(new Date(params.endDate).setHours(23, 59, 59, 999) / 1000)
              : undefined,
          }
        : undefined;

    const charges = await this.stripeProvider.getCharges({
      limit,
      starting_after: params?.startingAfter,
      created,
    });

    // Map charges to a cleaner format
    const transactions = charges.data.map((charge) => ({
      id: charge.id,
      amount: charge.amount / 100, // Convert from cents
      amountRefunded: charge.amount_refunded / 100,
      netAmount: (charge.amount - charge.amount_refunded) / 100,
      currency: charge.currency,
      status: charge.status,
      paid: charge.paid,
      refunded: charge.refunded,
      disputed: charge.disputed,
      description: charge.description,
      customerEmail: charge.billing_details?.email || charge.receipt_email,
      customerName: charge.billing_details?.name,
      paymentMethod: charge.payment_method_details?.type,
      cardBrand: charge.payment_method_details?.card?.brand,
      cardLast4: charge.payment_method_details?.card?.last4,
      receiptUrl: charge.receipt_url,
      createdAt: new Date(charge.created * 1000).toISOString(),
      metadata: charge.metadata,
    }));

    // Calculate summary
    const summary = {
      totalTransactions: transactions.length,
      successfulTransactions: transactions.filter((t) => t.status === 'succeeded').length,
      failedTransactions: transactions.filter((t) => t.status === 'failed').length,
      totalAmount: transactions
        .filter((t) => t.status === 'succeeded')
        .reduce((sum, t) => sum + t.amount, 0),
      totalRefunded: transactions.reduce((sum, t) => sum + t.amountRefunded, 0),
      netAmount: transactions
        .filter((t) => t.status === 'succeeded')
        .reduce((sum, t) => sum + t.netAmount, 0),
    };

    return {
      transactions,
      summary,
      hasMore: charges.has_more,
      nextCursor: charges.has_more ? charges.data[charges.data.length - 1]?.id : null,
    };
  }

  /**
   * Force cancel any order regardless of its current status.
   * Also cancels associated delivery, restores stock, and deletes earnings.
   */
  async forceCancelOrder(orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        delivery: { include: { deliveryPerson: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    // Cancel the order
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason || 'Cancelled by admin',
      },
    });

    // Restore product stock
    for (const item of order.items) {
      await this.prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }

    // Cancel associated delivery if exists
    if (order.delivery) {
      await this.prisma.delivery.update({
        where: { id: order.delivery.id },
        data: { status: 'CANCELLED' },
      });
    }

    // Delete any earnings for this order
    await this.prisma.earning.deleteMany({
      where: { orderId },
    });

    return { message: `Order ${order.orderNumber} force-cancelled by admin` };
  }

  /**
   * Force delete a cancelled order and all associated records.
   * Only works on already cancelled orders.
   */
  async forceDeleteOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true, payment: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException('Only cancelled orders can be deleted. Cancel the order first.');
    }

    // Delete in correct order (foreign key constraints)
    await this.prisma.earning.deleteMany({ where: { orderId } });
    await this.prisma.review.deleteMany({ where: { orderId } });
    await this.prisma.orderItem.deleteMany({ where: { orderId } });

    if (order.payment) {
      await this.prisma.payment.delete({ where: { id: order.payment.id } });
    }

    if (order.delivery) {
      await this.prisma.delivery.delete({ where: { id: order.delivery.id } });
    }

    await this.prisma.order.delete({ where: { id: orderId } });

    return { message: `Order ${order.orderNumber} permanently deleted` };
  }
}

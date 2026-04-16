import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { StripeProvider } from '../payments/providers/stripe.provider';
import { CreateConnectedAccountDto, CreateAccountLinkDto } from './dtos/create-connected-account.dto';
import { CreatePayoutDto, CreateBulkPayoutDto } from './dtos/create-payout.dto';
import { PayoutQueryDto, EarningsQueryDto } from './dtos/payout-query.dto';
import { UpdatePayoutScheduleDto } from './dtos/update-payout-schedule.dto';
import { StripeConnectStatus, EarningStatus, PayoutStatus, PayoutMethod, UserRole } from '@prisma/client';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private stripeProvider: StripeProvider,
  ) {}

  // ==================== STRIPE CONNECT ONBOARDING ====================

  /**
   * Create a Stripe Connect account for the current user
   */
  async createConnectedAccount(
    userId: string,
    userRole: UserRole,
    dto: CreateConnectedAccountDto,
  ) {
    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        bodegaOwner: true,
        deliveryPerson: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user already has a Stripe account
    const existingAccountId = userRole === UserRole.BODEGA_OWNER
      ? user.bodegaOwner?.stripeAccountId
      : user.deliveryPerson?.stripeAccountId;

    if (existingAccountId) {
      // Return existing account status
      const accountStatus = await this.stripeProvider.isAccountReady(existingAccountId);
      return {
        stripeAccountId: existingAccountId,
        ...accountStatus,
        message: 'Stripe account already exists',
      };
    }

    // Detect country: DTO > bodega's country > default 'US'
    let detectedCountry = dto.country || 'US';
    if (!dto.country && userRole === UserRole.BODEGA_OWNER && user.bodegaOwner) {
      const primaryBodega = await this.prisma.bodega.findFirst({
        where: { ownerId: user.bodegaOwner.id },
        orderBy: { isPrimary: 'desc' },
        select: { country: true },
      });
      if (primaryBodega?.country) {
        detectedCountry = StripeProvider.normalizeCountryCode(primaryBodega.country);
      }
    }

    this.logger.log(
      `Creating Stripe Connect account for user ${userId} in country=${detectedCountry}`,
    );

    // Create new Stripe Connect account
    const stripeAccount = await this.stripeProvider.createConnectedAccount({
      email: user.email,
      type: userRole === UserRole.BODEGA_OWNER ? 'bodeguero' : 'repartidor',
      businessName: dto.businessName || user.bodegaOwner?.businessName,
      firstName: user.firstName,
      lastName: user.lastName,
      country: detectedCountry,
    });

    // Update user's Stripe account ID
    if (userRole === UserRole.BODEGA_OWNER) {
      await this.prisma.bodegaOwner.update({
        where: { userId },
        data: {
          stripeAccountId: stripeAccount.id,
          stripeConnectStatus: StripeConnectStatus.PENDING,
        },
      });
    } else if (userRole === UserRole.DELIVERY_PERSON) {
      await this.prisma.deliveryPerson.update({
        where: { userId },
        data: {
          stripeAccountId: stripeAccount.id,
          stripeConnectStatus: StripeConnectStatus.PENDING,
        },
      });
    }

    this.logger.log(`Created Stripe Connect account ${stripeAccount.id} for user ${userId}`);

    return {
      stripeAccountId: stripeAccount.id,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      message: 'Stripe account created. Complete onboarding to receive payouts.',
    };
  }

  /**
   * Generate an account link for Stripe Connect onboarding
   */
  async createAccountLink(
    userId: string,
    userRole: UserRole,
    dto: CreateAccountLinkDto,
  ) {
    const stripeAccountId = await this.getStripeAccountId(userId, userRole);

    if (!stripeAccountId) {
      throw new BadRequestException('No Stripe account found. Please create one first.');
    }

    const accountLink = await this.stripeProvider.createAccountLink(
      stripeAccountId,
      dto.refreshUrl,
      dto.returnUrl,
    );

    return {
      url: accountLink.url,
      expiresAt: new Date(accountLink.expires_at * 1000).toISOString(),
    };
  }

  /**
   * Get the Stripe Express Dashboard login link
   */
  async getLoginLink(userId: string, userRole: UserRole) {
    const stripeAccountId = await this.getStripeAccountId(userId, userRole);

    if (!stripeAccountId) {
      throw new BadRequestException('No Stripe account found.');
    }

    const loginLink = await this.stripeProvider.createLoginLink(stripeAccountId);

    return {
      url: loginLink.url,
    };
  }

  /**
   * Get the current user's Stripe Connect account status
   */
  async getAccountStatus(userId: string, userRole: UserRole) {
    const stripeAccountId = await this.getStripeAccountId(userId, userRole);

    if (!stripeAccountId) {
      return {
        hasAccount: false,
        stripeAccountId: null,
        isReady: false,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirements: [],
      };
    }

    const status = await this.stripeProvider.isAccountReady(stripeAccountId);

    // Update the connect status in our database
    await this.updateConnectStatus(userId, userRole, status);

    return {
      hasAccount: true,
      stripeAccountId,
      ...status,
    };
  }

  /**
   * Refresh/sync the Stripe Connect status from Stripe
   */
  async refreshAccountStatus(userId: string, userRole: UserRole) {
    const stripeAccountId = await this.getStripeAccountId(userId, userRole);

    if (!stripeAccountId) {
      return {
        hasAccount: false,
        stripeAccountId: null,
        isReady: false,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirements: [],
      };
    }

    const status = await this.stripeProvider.isAccountReady(stripeAccountId);

    // Update local status
    let newStatus: StripeConnectStatus = StripeConnectStatus.PENDING;
    if (status.isReady) {
      newStatus = StripeConnectStatus.ACTIVE;
    } else if (status.requirements.length > 0) {
      newStatus = StripeConnectStatus.RESTRICTED;
    }

    if (userRole === UserRole.BODEGA_OWNER) {
      await this.prisma.bodegaOwner.update({
        where: { userId },
        data: {
          stripeConnectStatus: newStatus,
          stripeOnboardingComplete: status.detailsSubmitted,
        },
      });
    } else {
      await this.prisma.deliveryPerson.update({
        where: { userId },
        data: {
          stripeConnectStatus: newStatus,
          stripeOnboardingComplete: status.detailsSubmitted,
        },
      });
    }

    return {
      hasAccount: true,
      stripeAccountId,
      status: newStatus,
      ...status,
    };
  }

  // ==================== EARNINGS ====================

  /**
   * Get earnings for the current user
   */
  async getMyEarnings(userId: string, userRole: UserRole, query: EarningsQueryDto) {
    const where: any = {};

    if (userRole === UserRole.BODEGA_OWNER) {
      const bodegaOwner = await this.prisma.bodegaOwner.findUnique({
        where: { userId },
      });
      if (!bodegaOwner) throw new NotFoundException('Bodega owner not found');
      where.bodegaOwnerId = bodegaOwner.id;
    } else if (userRole === UserRole.DELIVERY_PERSON) {
      const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
        where: { userId },
      });
      if (!deliveryPerson) throw new NotFoundException('Delivery person not found');
      where.deliveryPersonId = deliveryPerson.id;
    } else {
      throw new ForbiddenException('Only bodega owners and delivery persons can view earnings');
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const skip = (query.page - 1) * query.limit;

    const [earnings, total] = await Promise.all([
      this.prisma.earning.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          payout: {
            select: {
              id: true,
              status: true,
              processedAt: true,
            },
          },
        },
      }),
      this.prisma.earning.count({ where }),
    ]);

    // Calculate summary
    const summary = await this.prisma.earning.aggregate({
      where: {
        ...where,
        status: EarningStatus.PENDING,
      },
      _sum: {
        netAmount: true,
      },
    });

    const totalEarned = await this.prisma.earning.aggregate({
      where: {
        ...where,
        status: EarningStatus.PAID,
      },
      _sum: {
        netAmount: true,
      },
    });

    return {
      earnings,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
      summary: {
        pendingAmount: summary._sum.netAmount || 0,
        totalEarned: totalEarned._sum.netAmount || 0,
      },
    };
  }

  /**
   * Get earnings summary for the current user
   */
  async getEarningsSummary(userId: string, userRole: UserRole) {
    const where: any = {};

    if (userRole === UserRole.BODEGA_OWNER) {
      const bodegaOwner = await this.prisma.bodegaOwner.findUnique({
        where: { userId },
      });
      if (!bodegaOwner) throw new NotFoundException('Bodega owner not found');
      where.bodegaOwnerId = bodegaOwner.id;
    } else if (userRole === UserRole.DELIVERY_PERSON) {
      const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
        where: { userId },
      });
      if (!deliveryPerson) throw new NotFoundException('Delivery person not found');
      where.deliveryPersonId = deliveryPerson.id;
    }

    const [pending, paid, thisMonth, thisWeek] = await Promise.all([
      this.prisma.earning.aggregate({
        where: { ...where, status: EarningStatus.PENDING },
        _sum: { netAmount: true },
        _count: true,
      }),
      this.prisma.earning.aggregate({
        where: { ...where, status: EarningStatus.PAID },
        _sum: { netAmount: true },
        _count: true,
      }),
      this.prisma.earning.aggregate({
        where: {
          ...where,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { netAmount: true },
      }),
      this.prisma.earning.aggregate({
        where: {
          ...where,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        _sum: { netAmount: true },
      }),
    ]);

    return {
      pendingAmount: pending._sum.netAmount || 0,
      pendingCount: pending._count,
      totalPaid: paid._sum.netAmount || 0,
      paidCount: paid._count,
      thisMonth: thisMonth._sum.netAmount || 0,
      thisWeek: thisWeek._sum.netAmount || 0,
    };
  }

  // ==================== PAYOUTS ====================

  /**
   * Get payouts for the current user
   */
  async getMyPayouts(userId: string, userRole: UserRole, query: PayoutQueryDto) {
    const where: any = {};

    if (userRole === UserRole.BODEGA_OWNER) {
      const bodegaOwner = await this.prisma.bodegaOwner.findUnique({
        where: { userId },
      });
      if (!bodegaOwner) throw new NotFoundException('Bodega owner not found');
      where.bodegaOwnerId = bodegaOwner.id;
    } else if (userRole === UserRole.DELIVERY_PERSON) {
      const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
        where: { userId },
      });
      if (!deliveryPerson) throw new NotFoundException('Delivery person not found');
      where.deliveryPersonId = deliveryPerson.id;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const skip = (query.page - 1) * query.limit;

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          earnings: {
            select: {
              id: true,
              orderId: true,
              type: true,
              netAmount: true,
            },
          },
        },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      payouts,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  // ==================== ADMIN FUNCTIONS ====================

  /**
   * Get all earnings (admin only)
   */
  async getAllEarnings(query: PayoutQueryDto) {
    const where: any = {};

    if (query.userType === 'bodeguero') {
      where.bodegaOwnerId = { not: null };
    } else if (query.userType === 'repartidor') {
      where.deliveryPersonId = { not: null };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const skip = (query.page - 1) * query.limit;

    const [earnings, total] = await Promise.all([
      this.prisma.earning.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          bodegaOwner: {
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          },
          deliveryPerson: {
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          },
          payout: {
            select: { id: true, status: true, processedAt: true },
          },
        },
      }),
      this.prisma.earning.count({ where }),
    ]);

    return {
      earnings,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /**
   * Get all payouts (admin only)
   */
  async getAllPayouts(query: PayoutQueryDto) {
    const where: any = {};

    if (query.userType === 'bodeguero') {
      where.bodegaOwnerId = { not: null };
    } else if (query.userType === 'repartidor') {
      where.deliveryPersonId = { not: null };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const skip = (query.page - 1) * query.limit;

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          bodegaOwner: {
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          },
          deliveryPerson: {
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          },
          _count: {
            select: { earnings: true },
          },
        },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      payouts,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /**
   * Get payout summary by user type (admin only)
   */
  async getPayoutSummary() {
    const [bodeguerosPending, repartidoresPending, bodeguerosPaid, repartidoresPaid] = await Promise.all([
      this.prisma.earning.aggregate({
        where: {
          bodegaOwnerId: { not: null },
          status: EarningStatus.PENDING,
        },
        _sum: { netAmount: true },
        _count: true,
      }),
      this.prisma.earning.aggregate({
        where: {
          deliveryPersonId: { not: null },
          status: EarningStatus.PENDING,
        },
        _sum: { netAmount: true },
        _count: true,
      }),
      this.prisma.earning.aggregate({
        where: {
          bodegaOwnerId: { not: null },
          status: EarningStatus.PAID,
        },
        _sum: { netAmount: true },
        _count: true,
      }),
      this.prisma.earning.aggregate({
        where: {
          deliveryPersonId: { not: null },
          status: EarningStatus.PAID,
        },
        _sum: { netAmount: true },
        _count: true,
      }),
    ]);

    // Get connected accounts count
    const [bodeguerosConnected, repartidoresConnected] = await Promise.all([
      this.prisma.bodegaOwner.count({
        where: { stripeConnectStatus: StripeConnectStatus.ACTIVE },
      }),
      this.prisma.deliveryPerson.count({
        where: { stripeConnectStatus: StripeConnectStatus.ACTIVE },
      }),
    ]);

    return {
      bodegueros: {
        pendingAmount: bodeguerosPending._sum.netAmount || 0,
        pendingCount: bodeguerosPending._count,
        paidAmount: bodeguerosPaid._sum.netAmount || 0,
        paidCount: bodeguerosPaid._count,
        connectedAccounts: bodeguerosConnected,
      },
      repartidores: {
        pendingAmount: repartidoresPending._sum.netAmount || 0,
        pendingCount: repartidoresPending._count,
        paidAmount: repartidoresPaid._sum.netAmount || 0,
        paidCount: repartidoresPaid._count,
        connectedAccounts: repartidoresConnected,
      },
      total: {
        pendingAmount: (bodeguerosPending._sum.netAmount || 0) + (repartidoresPending._sum.netAmount || 0),
        paidAmount: (bodeguerosPaid._sum.netAmount || 0) + (repartidoresPaid._sum.netAmount || 0),
      },
    };
  }

  /**
   * Create a payout for a specific user (admin only).
   * Routes the payout to Stripe Connect based on user's preferred method.
   */
  async createPayout(dto: CreatePayoutDto) {
    // Get user and their payout configuration
    let stripeAccountId: string | null = null;
    let preferredMethod: PayoutMethod = PayoutMethod.STRIPE;
    let ownerId: string | null = null;
    let deliveryPersonId: string | null = null;

    if (dto.userType === 'bodeguero') {
      const bodegaOwner = await this.prisma.bodegaOwner.findFirst({
        where: { userId: dto.userId },
      });
      if (!bodegaOwner) throw new NotFoundException('Bodega owner not found');

      preferredMethod = bodegaOwner.preferredPayoutMethod;
      stripeAccountId = bodegaOwner.stripeAccountId;
      ownerId = bodegaOwner.id;
    } else {
      const deliveryPerson = await this.prisma.deliveryPerson.findFirst({
        where: { userId: dto.userId },
      });
      if (!deliveryPerson) throw new NotFoundException('Delivery person not found');

      preferredMethod = deliveryPerson.preferredPayoutMethod;
      stripeAccountId = deliveryPerson.stripeAccountId;
      deliveryPersonId = deliveryPerson.id;
    }

    // Determine which method to use
    const payoutMethod = stripeAccountId ? PayoutMethod.STRIPE : preferredMethod;

    // Validate the chosen method is ready
    if (payoutMethod === PayoutMethod.STRIPE) {
      // Check Stripe Connect is active
      const connectStatus = dto.userType === 'bodeguero'
        ? (await this.prisma.bodegaOwner.findFirst({ where: { userId: dto.userId } }))?.stripeConnectStatus
        : (await this.prisma.deliveryPerson.findFirst({ where: { userId: dto.userId } }))?.stripeConnectStatus;

      if (connectStatus !== StripeConnectStatus.ACTIVE) {
        throw new BadRequestException('User has not completed Stripe onboarding');
      }
      if (!stripeAccountId) {
        throw new BadRequestException('User does not have a Stripe account');
      }
    } else {
      throw new BadRequestException(`Payout method ${payoutMethod} is not supported for automated payouts`);
    }

    // Get pending earnings
    const pendingEarnings = await this.prisma.earning.findMany({
      where: {
        status: EarningStatus.PENDING,
        ...(ownerId ? { bodegaOwnerId: ownerId } : { deliveryPersonId }),
      },
    });

    if (pendingEarnings.length === 0) {
      throw new BadRequestException('No pending earnings to pay out');
    }

    const totalAmount = pendingEarnings.reduce((sum, e) => sum + e.netAmount, 0);
    const payoutAmount = dto.amount || totalAmount;

    if (payoutAmount > totalAmount) {
      throw new BadRequestException(`Payout amount ($${payoutAmount}) exceeds pending earnings ($${totalAmount})`);
    }

    // Create payout record
    const payout = await this.prisma.payout.create({
      data: {
        bodegaOwnerId: ownerId,
        deliveryPersonId,
        amount: payoutAmount,
        payoutMethod,
        status: PayoutStatus.PROCESSING,
      },
    });

    try {
      let transferId: string;

      if (payoutMethod === PayoutMethod.STRIPE) {
        // === STRIPE PAYOUT ===
        const transfer = await this.stripeProvider.createTransfer(
          payoutAmount,
          stripeAccountId!,
          {
            payoutId: payout.id,
            userType: dto.userType,
            userId: dto.userId,
          },
        );

        transferId = transfer.id;

        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            stripeTransferId: transfer.id,
            status: PayoutStatus.COMPLETED,
            processedAt: new Date(),
          },
        });

        this.logger.log(
          `Stripe payout ${payout.id} completed: $${payoutAmount} to ${stripeAccountId}`,
        );
      } else {
        throw new BadRequestException(`Payout method ${payoutMethod} is not yet supported for automated payouts`);
      }

      // Update earnings as paid
      await this.prisma.earning.updateMany({
        where: {
          id: { in: pendingEarnings.map((e) => e.id) },
        },
        data: {
          status: EarningStatus.PAID,
          payoutId: payout.id,
        },
      });

      return {
        payout: await this.prisma.payout.findUnique({
          where: { id: payout.id },
          include: { earnings: true },
        }),
        transfer: {
          id: transferId,
          method: payoutMethod,
          amount: payoutAmount,
        },
      };
    } catch (error) {
      // Update payout as failed
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.FAILED,
          failureReason: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Process bulk payouts (admin only)
   */
  async processBulkPayouts(dto: CreateBulkPayoutDto) {
    const minimumAmount = dto.minimumAmount || 10;
    const results = {
      successful: [] as any[],
      failed: [] as any[],
      skipped: [] as any[],
    };

    // Get users with pending earnings above minimum
    const usersToProcess: Array<{
      type: 'bodeguero' | 'repartidor';
      id: string;
      stripeAccountId: string;
      userId: string;
      pendingAmount: number;
    }> = [];

    if (dto.userType === 'bodeguero' || dto.userType === 'all') {
      const bodegueros = await this.prisma.bodegaOwner.findMany({
        where: {
          stripeConnectStatus: StripeConnectStatus.ACTIVE,
          stripeAccountId: { not: null },
        },
        include: {
          earnings: {
            where: { status: EarningStatus.PENDING },
          },
        },
      });

      for (const b of bodegueros) {
        const pendingAmount = b.earnings.reduce((sum, e) => sum + e.netAmount, 0);
        if (pendingAmount >= minimumAmount) {
          usersToProcess.push({
            type: 'bodeguero',
            id: b.id,
            stripeAccountId: b.stripeAccountId!,
            userId: b.userId,
            pendingAmount,
          });
        } else if (pendingAmount > 0) {
          results.skipped.push({
            type: 'bodeguero',
            userId: b.userId,
            pendingAmount,
            reason: `Amount below minimum ($${minimumAmount})`,
          });
        }
      }
    }

    if (dto.userType === 'repartidor' || dto.userType === 'all') {
      const repartidores = await this.prisma.deliveryPerson.findMany({
        where: {
          stripeConnectStatus: StripeConnectStatus.ACTIVE,
          stripeAccountId: { not: null },
        },
        include: {
          earnings: {
            where: { status: EarningStatus.PENDING },
          },
        },
      });

      for (const r of repartidores) {
        const pendingAmount = r.earnings.reduce((sum, e) => sum + e.netAmount, 0);
        if (pendingAmount >= minimumAmount) {
          usersToProcess.push({
            type: 'repartidor',
            id: r.id,
            stripeAccountId: r.stripeAccountId!,
            userId: r.userId,
            pendingAmount,
          });
        } else if (pendingAmount > 0) {
          results.skipped.push({
            type: 'repartidor',
            userId: r.userId,
            pendingAmount,
            reason: `Amount below minimum ($${minimumAmount})`,
          });
        }
      }
    }

    // Process each payout
    for (const user of usersToProcess) {
      try {
        const result = await this.createPayout({
          userId: user.userId,
          userType: user.type,
        });
        results.successful.push({
          type: user.type,
          userId: user.userId,
          amount: user.pendingAmount,
          payoutId: result.payout?.id,
          transferId: result.transfer.id,
        });
      } catch (error) {
        results.failed.push({
          type: user.type,
          userId: user.userId,
          amount: user.pendingAmount,
          error: error.message,
        });
      }
    }

    return {
      processed: results.successful.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      totalAmount: results.successful.reduce((sum, r) => sum + r.amount, 0),
      results,
    };
  }

  /**
   * Get connected accounts list (admin only)
   */
  async getConnectedAccounts(query: PayoutQueryDto) {
    const where: any = {
      stripeAccountId: { not: null },
    };

    const skip = (query.page - 1) * query.limit;

    if (query.userType === 'bodeguero') {
      const [accounts, total] = await Promise.all([
        this.prisma.bodegaOwner.findMany({
          where,
          skip,
          take: query.limit,
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
            _count: {
              select: { earnings: true, payouts: true },
            },
          },
        }),
        this.prisma.bodegaOwner.count({ where }),
      ]);

      return {
        accounts: accounts.map((a) => ({
          ...a,
          type: 'bodeguero',
        })),
        total,
        page: query.page,
        limit: query.limit,
      };
    } else if (query.userType === 'repartidor') {
      const [accounts, total] = await Promise.all([
        this.prisma.deliveryPerson.findMany({
          where,
          skip,
          take: query.limit,
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
            _count: {
              select: { earnings: true, payouts: true },
            },
          },
        }),
        this.prisma.deliveryPerson.count({ where }),
      ]);

      return {
        accounts: accounts.map((a) => ({
          ...a,
          type: 'repartidor',
        })),
        total,
        page: query.page,
        limit: query.limit,
      };
    }

    // Return both
    const [bodegueros, repartidores] = await Promise.all([
      this.prisma.bodegaOwner.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.deliveryPerson.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return {
      accounts: [
        ...bodegueros.map((b) => ({ ...b, type: 'bodeguero' })),
        ...repartidores.map((r) => ({ ...r, type: 'repartidor' })),
      ],
      total: bodegueros.length + repartidores.length,
    };
  }

  // ==================== PLATFORM COMMISSIONS ====================

  /**
   * Get platform commission summary (admin only).
   * Aggregates platformFee from all earnings to show what BodeCart earns.
   */
  async getPlatformCommissions() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
    startOfWeek.setHours(0, 0, 0, 0);

    const [
      totalFromBodegueros,
      totalFromRepartidores,
      thisMonthFromBodegueros,
      thisMonthFromRepartidores,
      thisWeekFromBodegueros,
      thisWeekFromRepartidores,
      totalEarningsCount,
      settings,
    ] = await Promise.all([
      // All-time commissions from bodegueros
      this.prisma.earning.aggregate({
        where: { bodegaOwnerId: { not: null } },
        _sum: { platformFee: true, amount: true, netAmount: true },
        _count: true,
      }),
      // All-time commissions from repartidores
      this.prisma.earning.aggregate({
        where: { deliveryPersonId: { not: null } },
        _sum: { platformFee: true, amount: true, netAmount: true },
        _count: true,
      }),
      // This month from bodegueros
      this.prisma.earning.aggregate({
        where: {
          bodegaOwnerId: { not: null },
          createdAt: { gte: startOfMonth },
        },
        _sum: { platformFee: true },
        _count: true,
      }),
      // This month from repartidores
      this.prisma.earning.aggregate({
        where: {
          deliveryPersonId: { not: null },
          createdAt: { gte: startOfMonth },
        },
        _sum: { platformFee: true },
        _count: true,
      }),
      // This week from bodegueros
      this.prisma.earning.aggregate({
        where: {
          bodegaOwnerId: { not: null },
          createdAt: { gte: startOfWeek },
        },
        _sum: { platformFee: true },
      }),
      // This week from repartidores
      this.prisma.earning.aggregate({
        where: {
          deliveryPersonId: { not: null },
          createdAt: { gte: startOfWeek },
        },
        _sum: { platformFee: true },
      }),
      // Total earnings count
      this.prisma.earning.count(),
      // Commission rates
      this.prisma.systemSettings.findFirst(),
    ]);

    const bodegueroCommissions = totalFromBodegueros._sum.platformFee || 0;
    const repartidorCommissions = totalFromRepartidores._sum.platformFee || 0;
    const totalCommissions = bodegueroCommissions + repartidorCommissions;

    const thisMonthTotal = (thisMonthFromBodegueros._sum.platformFee || 0) +
      (thisMonthFromRepartidores._sum.platformFee || 0);
    const thisWeekTotal = (thisWeekFromBodegueros._sum.platformFee || 0) +
      (thisWeekFromRepartidores._sum.platformFee || 0);

    return {
      totalCommissions,
      thisMonth: thisMonthTotal,
      thisWeek: thisWeekTotal,
      totalTransactions: totalEarningsCount,
      bodegueros: {
        totalCommissions: bodegueroCommissions,
        totalGrossAmount: totalFromBodegueros._sum.amount || 0,
        totalNetToSeller: totalFromBodegueros._sum.netAmount || 0,
        transactionCount: totalFromBodegueros._count,
        thisMonth: thisMonthFromBodegueros._sum.platformFee || 0,
        thisMonthCount: thisMonthFromBodegueros._count,
      },
      repartidores: {
        totalCommissions: repartidorCommissions,
        totalGrossAmount: totalFromRepartidores._sum.amount || 0,
        totalNetToDriver: totalFromRepartidores._sum.netAmount || 0,
        transactionCount: totalFromRepartidores._count,
        thisMonth: thisMonthFromRepartidores._sum.platformFee || 0,
        thisMonthCount: thisMonthFromRepartidores._count,
      },
      commissionRates: {
        platformCommission: settings?.platformCommission ?? 10.0,
        deliveryPersonCommission: settings?.deliveryPersonCommission ?? 80.0,
      },
    };
  }

  // ==================== SCHEDULED PAYOUTS ====================

  /**
   * Runs every day at 06:00 UTC.
   * Reads payout schedule settings from SystemSettings and, when the schedule
   * criteria are met, delegates to processBulkPayouts for all eligible users.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async processScheduledPayouts(): Promise<void> {
    this.logger.log('Scheduled payout job triggered');

    const settings = await this.prisma.systemSettings.findFirst();

    // Read schedule settings with safe defaults
    const payoutEnabled = settings?.payoutEnabled ?? true;
    const payoutFrequency = settings?.payoutFrequency ?? 'weekly';
    const payoutDayOfWeek = settings?.payoutDayOfWeek ?? 1; // 0=Sun … 6=Sat; 1=Monday
    const payoutMinimumAmount = settings?.payoutMinimumAmount ?? 10.0;

    if (!payoutEnabled) {
      this.logger.log('Scheduled payouts are disabled — skipping');
      return;
    }

    if (payoutFrequency === 'manual') {
      this.logger.log('Payout frequency is set to manual — skipping scheduled run');
      return;
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
    const dayOfMonth = now.getDate();

    let shouldProcess = false;

    switch (payoutFrequency) {
      case 'daily':
        shouldProcess = true;
        break;

      case 'weekly':
        shouldProcess = dayOfWeek === payoutDayOfWeek;
        break;

      case 'biweekly':
        // Process on the configured weekday every other week.
        // Week number is calculated relative to the Unix epoch (Mon 1 Jan 1970).
        if (dayOfWeek === payoutDayOfWeek) {
          const msPerWeek = 7 * 24 * 60 * 60 * 1000;
          const weekNumber = Math.floor(now.getTime() / msPerWeek);
          shouldProcess = weekNumber % 2 === 0;
        }
        break;

      case 'monthly':
        // Process on the 1st of each month
        shouldProcess = dayOfMonth === 1;
        break;

      default:
        this.logger.warn(`Unknown payoutFrequency value "${payoutFrequency}" — skipping`);
        return;
    }

    if (!shouldProcess) {
      this.logger.log(
        `Payout schedule check: frequency=${payoutFrequency}, today does not match — skipping`,
      );
      return;
    }

    this.logger.log(
      `Payout schedule matched (frequency=${payoutFrequency}) — processing bulk payouts ` +
        `with minimumAmount=$${payoutMinimumAmount}`,
    );

    try {
      const result = await this.processBulkPayouts({
        userType: 'all',
        minimumAmount: payoutMinimumAmount,
      });

      this.logger.log(
        `Scheduled bulk payout complete: processed=${result.processed}, ` +
          `failed=${result.failed}, skipped=${result.skipped}, ` +
          `totalAmount=$${result.totalAmount}`,
      );
    } catch (error) {
      this.logger.error(`Scheduled bulk payout failed: ${error.message}`, error.stack);
    }
  }

  // ==================== ADMIN SCHEDULE SETTINGS ====================

  /**
   * Returns current payout schedule settings (admin only).
   */
  async getPayoutSchedule() {
    const settings = await this.prisma.systemSettings.findFirst();

    return {
      payoutEnabled: settings?.payoutEnabled ?? true,
      payoutFrequency: settings?.payoutFrequency ?? 'weekly',
      payoutDayOfWeek: settings?.payoutDayOfWeek ?? 1,
      payoutMinimumAmount: settings?.payoutMinimumAmount ?? 10.0,
    };
  }

  /**
   * Updates payout schedule settings (admin only).
   * If no SystemSettings row exists yet, one is created.
   */
  async updatePayoutSchedule(dto: UpdatePayoutScheduleDto) {
    const existing = await this.prisma.systemSettings.findFirst();

    const data: Record<string, unknown> = {};
    if (dto.payoutEnabled !== undefined) data.payoutEnabled = dto.payoutEnabled;
    if (dto.payoutFrequency !== undefined) data.payoutFrequency = dto.payoutFrequency;
    if (dto.payoutDayOfWeek !== undefined) data.payoutDayOfWeek = dto.payoutDayOfWeek;
    if (dto.payoutMinimumAmount !== undefined) data.payoutMinimumAmount = dto.payoutMinimumAmount;

    let updatedSettings;

    if (existing) {
      updatedSettings = await this.prisma.systemSettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      updatedSettings = await this.prisma.systemSettings.create({
        data: {
          payoutEnabled: dto.payoutEnabled ?? true,
          payoutFrequency: dto.payoutFrequency ?? 'weekly',
          payoutDayOfWeek: dto.payoutDayOfWeek ?? 1,
          payoutMinimumAmount: dto.payoutMinimumAmount ?? 10.0,
        },
      });
    }

    this.logger.log(
      `Payout schedule updated: ${JSON.stringify({
        payoutEnabled: updatedSettings.payoutEnabled,
        payoutFrequency: updatedSettings.payoutFrequency,
        payoutDayOfWeek: updatedSettings.payoutDayOfWeek,
        payoutMinimumAmount: updatedSettings.payoutMinimumAmount,
      })}`,
    );

    return {
      payoutEnabled: updatedSettings.payoutEnabled,
      payoutFrequency: updatedSettings.payoutFrequency,
      payoutDayOfWeek: updatedSettings.payoutDayOfWeek,
      payoutMinimumAmount: updatedSettings.payoutMinimumAmount,
    };
  }

  // ==================== PAYOUT METHOD PREFERENCES ====================

  /**
   * Get the user's current payout method preference and available methods.
   */
  async getPayoutMethodPreference(userId: string, userRole: UserRole) {
    if (userRole === UserRole.BODEGA_OWNER) {
      const owner = await this.prisma.bodegaOwner.findUnique({
        where: { userId },
        select: {
          preferredPayoutMethod: true,
          stripeAccountId: true,
          stripeConnectStatus: true,
          paypalEmail: true,
        },
      });
      if (!owner) throw new NotFoundException('Bodega owner not found');

      return {
        preferred: owner.preferredPayoutMethod,
        available: {
          stripe: !!owner.stripeAccountId && owner.stripeConnectStatus === StripeConnectStatus.ACTIVE,
          paypal: !!owner.paypalEmail,
        },
      };
    } else {
      const dp = await this.prisma.deliveryPerson.findUnique({
        where: { userId },
        select: {
          preferredPayoutMethod: true,
          stripeAccountId: true,
          stripeConnectStatus: true,
          paypalEmail: true,
        },
      });
      if (!dp) throw new NotFoundException('Delivery person not found');

      return {
        preferred: dp.preferredPayoutMethod,
        available: {
          stripe: !!dp.stripeAccountId && dp.stripeConnectStatus === StripeConnectStatus.ACTIVE,
          paypal: !!dp.paypalEmail,
        },
      };
    }
  }

  /**
   * Set the user's preferred payout method.
   */
  async setPayoutMethodPreference(
    userId: string,
    userRole: UserRole,
    dto: { method: string },
  ) {
    const method = dto.method as PayoutMethod;

    if (userRole === UserRole.BODEGA_OWNER) {
      await this.prisma.bodegaOwner.update({
        where: { userId },
        data: { preferredPayoutMethod: method },
      });
    } else if (userRole === UserRole.DELIVERY_PERSON) {
      await this.prisma.deliveryPerson.update({
        where: { userId },
        data: { preferredPayoutMethod: method },
      });
    }

    this.logger.log(`User ${userId} set preferred payout method to ${method}`);

    return { preferredPayoutMethod: method };
  }

  // ==================== HELPER METHODS ====================

  private async getStripeAccountId(userId: string, userRole: UserRole): Promise<string | null> {
    if (userRole === UserRole.BODEGA_OWNER) {
      const bodegaOwner = await this.prisma.bodegaOwner.findUnique({
        where: { userId },
        select: { stripeAccountId: true },
      });
      return bodegaOwner?.stripeAccountId || null;
    } else if (userRole === UserRole.DELIVERY_PERSON) {
      const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
        where: { userId },
        select: { stripeAccountId: true },
      });
      return deliveryPerson?.stripeAccountId || null;
    }
    return null;
  }

  private async updateConnectStatus(
    userId: string,
    userRole: UserRole,
    status: { isReady: boolean; detailsSubmitted: boolean; requirements: string[] },
  ) {
    let newStatus: StripeConnectStatus = StripeConnectStatus.PENDING;
    if (status.isReady) {
      newStatus = StripeConnectStatus.ACTIVE;
    } else if (status.requirements.length > 0 && status.detailsSubmitted) {
      newStatus = StripeConnectStatus.RESTRICTED;
    }

    if (userRole === UserRole.BODEGA_OWNER) {
      await this.prisma.bodegaOwner.update({
        where: { userId },
        data: {
          stripeConnectStatus: newStatus,
          stripeOnboardingComplete: status.detailsSubmitted,
        },
      });
    } else if (userRole === UserRole.DELIVERY_PERSON) {
      await this.prisma.deliveryPerson.update({
        where: { userId },
        data: {
          stripeConnectStatus: newStatus,
          stripeOnboardingComplete: status.detailsSubmitted,
        },
      });
    }
  }
}

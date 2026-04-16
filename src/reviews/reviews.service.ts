import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { CreateReviewDto } from './dtos/create-review.dto';
import { RespondReviewDto } from './dtos/respond-review.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  async create(userId: string, dto: CreateReviewDto) {
    // Find client by userId
    const client = await this.prisma.client.findUnique({
      where: { userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    // Find order and verify it belongs to this client and is DELIVERED
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        delivery: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.clientId !== client.id) {
      throw new ForbiddenException('This order does not belong to you');
    }
    if (order.status !== 'DELIVERED') {
      throw new BadRequestException('Can only review delivered orders');
    }

    // Check if already reviewed
    const existingReview = await this.prisma.review.findUnique({
      where: { orderId: dto.orderId },
    });
    if (existingReview) {
      throw new BadRequestException('This order has already been reviewed');
    }

    // Get deliveryPersonId from the order's delivery
    const deliveryPersonId = order.delivery?.deliveryPersonId || null;

    // Create review
    const review = await this.prisma.review.create({
      data: {
        clientId: client.id,
        bodegaId: order.bodegaId,
        orderId: dto.orderId,
        deliveryPersonId: dto.deliveryRating ? deliveryPersonId : null,
        rating: dto.rating,
        deliveryRating: dto.deliveryRating || null,
        comment: dto.comment || null,
      },
      include: {
        client: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatar: true },
            },
          },
        },
      },
    });

    // Recalculate bodega rating
    await this.recalculateBodegaRating(order.bodegaId);

    // Recalculate delivery person rating if applicable
    if (deliveryPersonId && dto.deliveryRating) {
      await this.recalculateDeliveryPersonRating(deliveryPersonId);
    }

    // Notify via WebSocket (broadcast, bodeguero app filters by bodegaId)
    this.logger.log(`Review created for bodega ${order.bodegaId}, broadcasting review:new`);
    this.websocketGateway.emitNewReview(order.bodegaId, review);

    return review;
  }

  async findByBodega(bodegaId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { bodegaId },
        include: {
          client: {
            include: {
              user: {
                select: { firstName: true, lastName: true, avatar: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({ where: { bodegaId } }),
    ]);

    return {
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByDeliveryPerson(deliveryPersonId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: {
          deliveryPersonId,
          deliveryRating: { not: null },
        },
        include: {
          client: {
            include: {
              user: {
                select: { firstName: true, lastName: true, avatar: true },
              },
            },
          },
          bodega: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({
        where: {
          deliveryPersonId,
          deliveryRating: { not: null },
        },
      }),
    ]);

    return {
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByOrder(orderId: string) {
    return this.prisma.review.findUnique({
      where: { orderId },
      include: {
        client: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatar: true },
            },
          },
        },
      },
    });
  }

  async findByOwner(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    // Find bodegas owned by this user
    const owner = await this.prisma.bodegaOwner.findUnique({
      where: { userId },
      include: { bodegas: { select: { id: true } } },
    });
    if (!owner) {
      throw new NotFoundException('Bodega owner profile not found');
    }

    const bodegaIds = owner.bodegas.map((b) => b.id);

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { bodegaId: { in: bodegaIds } },
        include: {
          client: {
            include: {
              user: {
                select: { firstName: true, lastName: true, avatar: true },
              },
            },
          },
          bodega: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({
        where: { bodegaId: { in: bodegaIds } },
      }),
    ]);

    return {
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async respond(reviewId: string, userId: string, dto: RespondReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        bodega: {
          include: { owner: true },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Verify user is the bodega owner
    if (review.bodega.owner.userId !== userId) {
      throw new ForbiddenException(
        'You can only respond to reviews for your own bodegas',
      );
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        response: dto.response,
        respondedAt: new Date(),
      },
      include: {
        client: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatar: true },
            },
          },
        },
      },
    });
  }

  private async recalculateBodegaRating(bodegaId: string) {
    const result = await this.prisma.review.aggregate({
      where: { bodegaId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.bodega.update({
      where: { id: bodegaId },
      data: {
        rating: result._avg.rating || 0,
        totalReviews: result._count.rating,
      },
    });
  }

  private async recalculateDeliveryPersonRating(deliveryPersonId: string) {
    const result = await this.prisma.review.aggregate({
      where: {
        deliveryPersonId,
        deliveryRating: { not: null },
      },
      _avg: { deliveryRating: true },
      _count: { deliveryRating: true },
    });

    await this.prisma.deliveryPerson.update({
      where: { id: deliveryPersonId },
      data: {
        rating: result._avg.deliveryRating || 0,
      },
    });
  }
}

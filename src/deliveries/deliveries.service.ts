import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MapsService } from '../common/maps/maps.service';
import { UploadService } from '../common/upload/upload.service';
import { AssignDeliveryDto } from './dtos/assign-delivery.dto';
import { UpdateLocationDto } from './dtos/update-location.dto';
import { CompleteDeliveryDto } from './dtos/complete-delivery.dto';
import { DeliveryStatus, OrderStatus, UserRole, EarningType } from '@prisma/client';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private prisma: PrismaService,
    private mapsService: MapsService,
    private uploadService: UploadService,
    private websocketGateway: WebsocketGateway,
    private notificationsService: NotificationsService,
  ) { }

  async uploadProofPhoto(
    deliveryId: string,
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliveryPerson: true },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    if (delivery.deliveryPerson.userId !== userId) {
      throw new ForbiddenException('You can only upload photos for your own deliveries');
    }

    const url = await this.uploadService.uploadFile(
      file,
      'delivery-proofs',
      `${deliveryId}-${Date.now()}`,
    );

    return url;
  }

  async getAvailableDeliveries(userId: string) {
    // Get delivery person
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { userId },
    });

    if (!deliveryPerson) {
      throw new ForbiddenException('Only delivery persons can view available deliveries');
    }

    if (!deliveryPerson.currentLat || !deliveryPerson.currentLng) {
      throw new BadRequestException('Please update your location first');
    }

    // Find orders available for delivery (from placed to ready for pickup)
    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.PLACED,
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY_FOR_PICKUP,
          ],
        },
        deliveryId: null,
      },
      include: {
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

    // Calculate distance and filter nearby
    const nearbyOrders = orders
      .map((order) => {
        const distance = this.mapsService.calculateDistance(
          { latitude: deliveryPerson.currentLat!, longitude: deliveryPerson.currentLng! },
          { latitude: order.bodega.latitude, longitude: order.bodega.longitude },
        );
        return { ...order, distance };
      })
      .filter((order) => order.distance <= (order.bodega.deliveryRadius ?? 10.0))
      .sort((a, b) => a.distance - b.distance);

    return nearbyOrders;
  }

  async assignDelivery(assignDeliveryDto: AssignDeliveryDto, userId: string) {
    const { orderId } = assignDeliveryDto;

    // Get delivery person
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { userId },
    });

    if (!deliveryPerson) {
      throw new ForbiddenException('Only delivery persons can assign deliveries');
    }

    if (!deliveryPerson.isVerified) {
      throw new ForbiddenException(
        'Your account must be verified before you can accept deliveries',
      );
    }

    if (!deliveryPerson.currentLat || !deliveryPerson.currentLng) {
      throw new BadRequestException('Please update your location first');
    }

    // Get order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        bodega: true,
        address: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowedStatuses: OrderStatus[] = [
      OrderStatus.PLACED,
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_PICKUP,
    ];
    if (!allowedStatuses.includes(order.status)) {
      throw new BadRequestException('Order is not available for delivery assignment');
    }

    if (order.deliveryId) {
      throw new BadRequestException('Order already has a delivery assigned');
    }

    // Allow multiple deliveries only from the same bodega
    const activeDeliveries = await this.prisma.delivery.findMany({
      where: {
        deliveryPersonId: deliveryPerson.id,
        status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT] },
      },
      include: {
        order: { select: { bodegaId: true } },
      },
    });

    if (activeDeliveries.length > 0) {
      const activeBodegaId = activeDeliveries[0].order?.bodegaId;
      if (activeBodegaId && activeBodegaId !== order.bodegaId) {
        throw new BadRequestException(
          'Solo puedes aceptar pedidos de la misma bodega mientras tengas entregas activas',
        );
      }
    }

    // Calculate delivery fee based on distance
    const distance = this.mapsService.calculateDistance(
      { latitude: order.bodega.latitude, longitude: order.bodega.longitude },
      { latitude: order.address.latitude, longitude: order.address.longitude },
    );

    const settings = await this.prisma.systemSettings.findFirst();
    const baseFee = settings?.baseDeliveryFee ?? 2.99;
    const perKmFee = settings?.perKmDeliveryFee ?? 0.5;
    const deliveryFee = parseFloat((baseFee + distance * perKmFee).toFixed(2));

    // Estimate time (assuming 30 km/h average speed)
    const estimatedTime = Math.round((distance / 30) * 60); // in minutes

    // Create delivery
    const delivery = await this.prisma.delivery.create({
      data: {
        deliveryPersonId: deliveryPerson.id,
        status: DeliveryStatus.ASSIGNED,
        pickupLat: order.bodega.latitude,
        pickupLng: order.bodega.longitude,
        dropoffLat: order.address.latitude,
        dropoffLng: order.address.longitude,
        currentLat: deliveryPerson.currentLat,
        currentLng: deliveryPerson.currentLng,
        estimatedDistance: distance,
        estimatedTime,
        fee: deliveryFee,
        assignedAt: new Date(),
      },
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
    });

    // Update order with delivery assignment
    // Only advance to PICKING_UP if order is already READY_FOR_PICKUP
    const updateData: any = { deliveryId: delivery.id };
    if (order.status === OrderStatus.READY_FOR_PICKUP) {
      updateData.status = OrderStatus.PICKING_UP;
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    this.logger.log(`Delivery assigned: ${delivery.id} to ${deliveryPerson.id} (active deliveries: ${activeDeliveries.length + 1})`);

    // Emit real-time assignment to delivery person
    this.websocketGateway.emitDeliveryAssigned(delivery.deliveryPersonId, delivery);

    // Push notification to client about delivery assignment (fire-and-forget)
    this.notificationsService.notifyDeliveryAssigned(delivery.id).catch((err) => {
      this.logger.error(`Failed to send push for delivery assignment ${delivery.id}: ${err.message}`);
    });

    return delivery;
  }

  async pickupDelivery(id: string, userId: string, pickupPhoto?: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        deliveryPerson: {
          include: { user: true },
        },
        order: true,
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    if (delivery.deliveryPerson.userId !== userId) {
      throw new ForbiddenException('You can only update your own deliveries');
    }

    if (delivery.status !== DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('Delivery must be in ASSIGNED status to mark as picked up');
    }

    // Verify the order is ready for pickup
    if (delivery.order && delivery.order.status !== OrderStatus.READY_FOR_PICKUP && delivery.order.status !== OrderStatus.PICKING_UP) {
      throw new BadRequestException('El pedido aún no está listo para recoger. Espera a que la bodega lo marque como listo.');
    }

    const updatedDelivery = await this.prisma.delivery.update({
      where: { id },
      data: {
        status: DeliveryStatus.PICKED_UP,
        pickedUpAt: new Date(),
        ...(pickupPhoto ? { pickupPhoto } : {}),
      },
    });

    // Update order status to PICKING_UP and emit WebSocket event
    const order = await this.prisma.order.findFirst({
      where: { deliveryId: id },
    });

    if (order) {
      const updatedOrder = await this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PICKING_UP },
      });

      this.websocketGateway.emitOrderStatusUpdate(order.id, OrderStatus.PICKING_UP, {
        ...updatedOrder,
        pickupPhoto: updatedDelivery.pickupPhoto,
      });
    }

    this.logger.log(`Delivery picked up: ${delivery.id}${pickupPhoto ? ' (with photo)' : ''}`);

    return updatedDelivery;
  }

  async updateLocation(id: string, updateLocationDto: UpdateLocationDto, userId: string) {
    const { latitude, longitude } = updateLocationDto;

    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        deliveryPerson: {
          include: { user: true },
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    if (delivery.deliveryPerson.userId !== userId) {
      throw new ForbiddenException('You can only update your own delivery locations');
    }

    if (
      delivery.status !== DeliveryStatus.ASSIGNED &&
      delivery.status !== DeliveryStatus.PICKED_UP &&
      delivery.status !== DeliveryStatus.IN_TRANSIT
    ) {
      throw new BadRequestException('Can only update location for active deliveries');
    }

    // Only transition to IN_TRANSIT if already PICKED_UP or IN_TRANSIT
    const newStatus =
      delivery.status === DeliveryStatus.PICKED_UP || delivery.status === DeliveryStatus.IN_TRANSIT
        ? DeliveryStatus.IN_TRANSIT
        : delivery.status;

    // Update delivery location
    const updatedDelivery = await this.prisma.delivery.update({
      where: { id },
      data: {
        currentLat: latitude,
        currentLng: longitude,
        status: newStatus,
      },
    });

    // Update delivery person location
    await this.prisma.deliveryPerson.update({
      where: { id: delivery.deliveryPersonId },
      data: {
        currentLat: latitude,
        currentLng: longitude,
      },
    });

    // Only advance order to ON_THE_WAY after pickup (delivery is IN_TRANSIT)
    if (newStatus === DeliveryStatus.IN_TRANSIT) {
      const order = await this.prisma.order.findFirst({
        where: { deliveryId: id },
      });

      if (order && order.status !== OrderStatus.ON_THE_WAY) {
        const updatedOrder = await this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.ON_THE_WAY },
        });

        this.websocketGateway.emitOrderStatusUpdate(
          order.id,
          OrderStatus.ON_THE_WAY,
          updatedOrder,
        );
      }
    }

    // Emit real-time location update
    this.websocketGateway.emitDeliveryLocationUpdated(id, latitude, longitude, delivery.deliveryPerson?.vehicleType);

    return updatedDelivery;
  }

  async completeDelivery(id: string, completeDeliveryDto: CompleteDeliveryDto, userId: string) {
    const { signature, photo, notes } = completeDeliveryDto;

    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        deliveryPerson: {
          include: { user: true },
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    if (delivery.deliveryPerson.userId !== userId) {
      throw new ForbiddenException('You can only complete your own deliveries');
    }

    if (delivery.status === DeliveryStatus.DELIVERED) {
      throw new BadRequestException('Delivery already completed');
    }

    // Calculate actual distance
    let actualDistance = delivery.estimatedDistance;
    if (delivery.currentLat && delivery.currentLng) {
      actualDistance = this.mapsService.calculateDistance(
        { latitude: delivery.pickupLat, longitude: delivery.pickupLng },
        { latitude: delivery.currentLat, longitude: delivery.currentLng },
      );
    }

    // Update delivery
    const updatedDelivery = await this.prisma.delivery.update({
      where: { id },
      data: {
        status: DeliveryStatus.DELIVERED,
        signature,
        photo,
        notes,
        actualDistance,
        deliveredAt: new Date(),
      },
    });

    // Update order status
    const order = await this.prisma.order.findFirst({
      where: { deliveryId: id },
    });

    if (order) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.DELIVERED,
          completedAt: new Date(),
        },
      });

      // Update bodega stats
      await this.prisma.bodega.update({
        where: { id: order.bodegaId },
        data: {
          totalOrders: { increment: 1 },
        },
      });

      // Auto-create earning records
      await this.createEarningsForDeliveredOrder(order, delivery).catch((err) => {
        this.logger.error(
          `Failed to create earnings for order ${order.id}: ${err.message}`,
          err.stack,
        );
      });

      // Emit order status update for delivery completion
      this.websocketGateway.emitOrderStatusUpdate(order.id, OrderStatus.DELIVERED, {
        ...order,
        status: OrderStatus.DELIVERED,
        completedAt: new Date(),
      });

      // Push notification to client about delivery completion (fire-and-forget)
      this.notificationsService.notifyOrderStatusChanged(order.id, OrderStatus.DELIVERED).catch((err) => {
        this.logger.error(`Failed to send push for delivery completion ${id}: ${err.message}`);
      });
    }

    // Update delivery person stats and set as available
    // Count ALL deliveries assigned to this person
    const totalAssigned = await this.prisma.delivery.count({
      where: { deliveryPersonId: delivery.deliveryPersonId },
    });

    // Count delivered deliveries (already includes current one updated above)
    const deliveredCount = await this.prisma.delivery.count({
      where: {
        deliveryPersonId: delivery.deliveryPersonId,
        status: DeliveryStatus.DELIVERED,
      },
    });

    const completionRate = totalAssigned > 0
      ? (deliveredCount / totalAssigned) * 100
      : 0;

    await this.prisma.deliveryPerson.update({
      where: { id: delivery.deliveryPersonId },
      data: {
        totalDeliveries: totalAssigned,
        completionRate,
        isAvailable: true,
      },
    });

    this.logger.log(`Delivery completed: ${delivery.id}`);

    return updatedDelivery;
  }

  async findOne(id: string, userId: string, userRole: UserRole) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
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
        order: {
          include: {
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
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    // Check permissions
    if (userRole === UserRole.DELIVERY_PERSON) {
      if (delivery.deliveryPerson.userId !== userId) {
        throw new ForbiddenException('You can only view your own deliveries');
      }
    } else if (userRole === UserRole.CLIENT) {
      const order = delivery.order;
      if (order && order.client.userId !== userId) {
        throw new ForbiddenException('You can only view deliveries for your orders');
      }
    } else if (userRole === UserRole.BODEGA_OWNER) {
      const order = delivery.order;
      if (order) {
        const bodega = await this.prisma.bodega.findUnique({
          where: { id: order.bodegaId },
          include: {
            owner: {
              include: { user: true },
            },
          },
        });
        if (bodega && bodega.owner.userId !== userId) {
          throw new ForbiddenException('You can only view deliveries for your orders');
        }
      }
    }

    return delivery;
  }

  async getMyDeliveries(userId: string, userRole: UserRole) {
    if (userRole !== UserRole.DELIVERY_PERSON) {
      throw new ForbiddenException('Only delivery persons can view their deliveries');
    }

    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { userId },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Delivery person not found');
    }

    const deliveries = await this.prisma.delivery.findMany({
      where: { deliveryPersonId: deliveryPerson.id },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          include: {
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
        },
      },
    });

    return deliveries;
  }

  async updateMyLocation(userId: string, dto: UpdateLocationDto) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { userId },
    });

    if (!deliveryPerson) {
      throw new ForbiddenException('Only delivery persons can update location');
    }

    return this.prisma.deliveryPerson.update({
      where: { id: deliveryPerson.id },
      data: { currentLat: dto.latitude, currentLng: dto.longitude },
    });
  }

  async updateAvailability(userId: string, isAvailable: boolean) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { userId },
    });

    if (!deliveryPerson) {
      throw new ForbiddenException('Only delivery persons can update availability');
    }

    if (isAvailable && !deliveryPerson.isVerified) {
      throw new ForbiddenException(
        'Your account must be verified before you can be available for deliveries',
      );
    }

    const updated = await this.prisma.deliveryPerson.update({
      where: { id: deliveryPerson.id },
      data: { isAvailable },
    });

    return updated;
  }

  /**
   * Creates Earning records when a delivery is completed.
   * This is the actual path that runs (completeDelivery), not OrdersService.updateStatus.
   */
  private async createEarningsForDeliveredOrder(order: any, delivery: any): Promise<void> {
    const settings = await this.prisma.systemSettings.findFirst();
    const platformCommissionPct = settings?.platformCommission ?? 10.0;
    const deliveryPersonCommissionPct = settings?.deliveryPersonCommission ?? 80.0;

    // Get bodega owner ID
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: order.bodegaId },
      select: { ownerId: true },
    });
    const bodegaOwnerId = bodega?.ownerId;

    const deliveryPersonId = delivery.deliveryPersonId;

    const earningsToCreate: Array<{
      orderId: string;
      bodegaOwnerId?: string;
      deliveryPersonId?: string;
      type: EarningType;
      amount: number;
      platformFee: number;
      netAmount: number;
    }> = [];

    // ORDER_SALE for bodeguero
    if (bodegaOwnerId && order.subtotal > 0) {
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

    // DELIVERY_FEE for repartidor
    if (deliveryPersonId && delivery.fee > 0) {
      const amount = delivery.fee as number;
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

      // TIP for repartidor (100% to them)
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
      this.logger.warn(`No earnings created for order ${order.id}: missing relations`);
      return;
    }

    await this.prisma.earning.createMany({
      data: earningsToCreate,
      skipDuplicates: true,
    });

    this.logger.log(
      `Created ${earningsToCreate.length} earning(s) for order ${order.id} ` +
        `(platform: ${platformCommissionPct}%, delivery: ${deliveryPersonCommissionPct}%)`,
    );
  }
}

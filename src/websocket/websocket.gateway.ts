import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { MapsService } from '../common/maps/maps.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private userSockets: Map<string, string> = new Map(); // userId -> socketId

  constructor(
    private jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mapsService: MapsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract JWT from handshake auth
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: No token provided`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;

      // Store user socket mapping and join user-specific room
      this.userSockets.set(userId, client.id);
      client.data.userId = userId;
      client.data.role = payload.role;
      client.join(`user:${userId}`);

      this.logger.log(`Client connected: ${client.id} (User: ${userId}, Role: ${payload.role})`);
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.userSockets.delete(userId);
      this.logger.log(`Client disconnected: ${client.id} (User: ${userId})`);
    }
  }

  // Subscribe to order updates
  @SubscribeMessage('order:subscribe')
  handleOrderSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    client.join(`order:${data.orderId}`);
    this.logger.log(`Client ${client.id} subscribed to order ${data.orderId}`);
    return { success: true };
  }

  // Unsubscribe from order updates
  @SubscribeMessage('order:unsubscribe')
  handleOrderUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    client.leave(`order:${data.orderId}`);
    this.logger.log(`Client ${client.id} unsubscribed from order ${data.orderId}`);
    return { success: true };
  }

  // Subscribe to delivery updates
  @SubscribeMessage('delivery:subscribe')
  handleDeliverySubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deliveryId: string },
  ) {
    client.join(`delivery:${data.deliveryId}`);
    this.logger.log(`Client ${client.id} subscribed to delivery ${data.deliveryId}`);
    return { success: true };
  }

  // Unsubscribe from delivery updates
  @SubscribeMessage('delivery:unsubscribe')
  handleDeliveryUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deliveryId: string },
  ) {
    client.leave(`delivery:${data.deliveryId}`);
    this.logger.log(`Client ${client.id} unsubscribed from delivery ${data.deliveryId}`);
    return { success: true };
  }

  // Delivery person location update
  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deliveryId: string; latitude: number; longitude: number; vehicleType?: string },
  ) {
    try {
      const userId = client.data.userId;
      if (!userId) return { success: false, error: 'Unauthorized' };

      // Validate driver owns this delivery
      const delivery = await this.prisma.delivery.findFirst({
        where: {
          id: data.deliveryId,
          deliveryPerson: {
            userId: userId,
          },
        },
        include: {
          deliveryPerson: { select: { vehicleType: true } },
        },
      });

      if (!delivery) {
        this.logger.warn(`User ${userId} attempted to update location for unauthorized delivery ${data.deliveryId}`);
        return { success: false, error: 'Unauthorized delivery update' };
      }

      // Persist location in DB so REST polling also returns fresh coordinates
      await Promise.all([
        this.prisma.delivery.update({
          where: { id: data.deliveryId },
          data: { currentLat: data.latitude, currentLng: data.longitude },
        }),
        this.prisma.deliveryPerson.update({
          where: { id: delivery.deliveryPersonId },
          data: { currentLat: data.latitude, currentLng: data.longitude },
        }),
      ]);

      // Broadcast to all clients subscribed to this delivery
      this.server.to(`delivery:${data.deliveryId}`).emit('delivery:location:updated', {
        deliveryId: data.deliveryId,
        latitude: data.latitude,
        longitude: data.longitude,
        vehicleType: data.vehicleType || delivery.deliveryPerson?.vehicleType || 'MOTORCYCLE',
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error in location:update: ${error.message}`);
      return { success: false, error: 'Internal server error' };
    }
  }

  // Emit delivery location update (from REST updates)
  emitDeliveryLocationUpdated(deliveryId: string, latitude: number, longitude: number, vehicleType?: string) {
    this.server.to(`delivery:${deliveryId}`).emit('delivery:location:updated', {
      deliveryId,
      latitude,
      longitude,
      vehicleType: vehicleType || 'MOTORCYCLE',
      timestamp: new Date().toISOString(),
    });
  }

  // Emit order status update (called from OrdersService)
  emitOrderStatusUpdate(orderId: string, status: string, order: any) {
    this.server.to(`order:${orderId}`).emit('order:status:updated', {
      orderId,
      status,
      order,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Order ${orderId} status updated to ${status}`);
  }

  // Emit new order notification to bodeguero (called from OrdersService)
  emitNewOrderToBodega(bodegaId: string, order: any) {
    // Find all bodeguero sockets and emit
    this.server.emit('order:new', {
      bodegaId,
      order,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`New order ${order.id} for bodega ${bodegaId}`);
  }

  // Emit delivery assignment (called from DeliveriesService)
  emitDeliveryAssigned(deliveryPersonId: string, delivery: any) {
    const socketId = this.userSockets.get(deliveryPersonId);
    if (socketId) {
      this.server.to(socketId).emit('delivery:assigned', {
        delivery,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`Delivery ${delivery.id} assigned to ${deliveryPersonId}`);
    }
  }

  // Emit new order notification to delivery persons within range of the bodega
  async emitNewOrderToDeliveryPersons(order: any) {
    // Ensure bodega data is available on the order
    const bodega = order.bodega;
    if (!bodega || bodega.latitude == null || bodega.longitude == null) {
      this.logger.warn(`Order ${order.id} missing bodega location data, skipping delivery notification`);
      return;
    }

    const deliveryRadius = bodega.deliveryRadius ?? 10.0;

    // Find all available, verified delivery persons that have reported their location
    const deliveryPersons = await this.prisma.deliveryPerson.findMany({
      where: {
        isAvailable: true,
        isVerified: true,
        currentLat: { not: null },
        currentLng: { not: null },
      },
      select: { userId: true, currentLat: true, currentLng: true },
    });

    let notified = 0;
    for (const dp of deliveryPersons) {
      // Filter by Haversine distance
      const distance = this.mapsService.calculateDistance(
        { latitude: bodega.latitude, longitude: bodega.longitude },
        { latitude: dp.currentLat!, longitude: dp.currentLng! },
      );

      if (distance > deliveryRadius) continue;

      const socketId = this.userSockets.get(dp.userId);
      if (socketId) {
        this.server.to(socketId).emit('order:new:delivery', {
          order,
          distance: Math.round(distance * 10) / 10, // km with 1 decimal
          timestamp: new Date().toISOString(),
        });
        notified++;
      }
    }
    this.logger.log(
      `New order ${order.id} notified to ${notified}/${deliveryPersons.length} delivery persons within ${deliveryRadius}km`,
    );
  }

  // Emit new review notification (broadcast, bodeguero filters by bodegaId)
  emitNewReview(bodegaId: string, review: any) {
    this.server.emit('review:new', {
      bodegaId,
      review,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`New review event broadcast for bodega ${bodegaId}`);
  }

  // Emit bodega status change (called from BodegasService cron)
  emitBodegaStatusChanged(bodegaId: string, isOpen: boolean) {
    this.server.emit('bodega:status:updated', {
      bodegaId,
      isOpen,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Bodega ${bodegaId} status changed to ${isOpen ? 'OPEN' : 'CLOSED'}`);
  }

  // Emit notification (called from NotificationsService)
  emitNotification(userId: string, notification: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('notification:new', {
        notification,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`Notification sent to user ${userId}`);
    }
  }
}

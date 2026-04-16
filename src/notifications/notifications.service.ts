import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { MapsService } from '../common/maps/maps.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly i18n: Record<string, Record<string, { title: string; body: string }>> = {
    new_order_available: {
      es: { title: 'Nuevo pedido disponible', body: 'Nuevo pedido disponible para entrega desde {bodegaName}' },
      en: { title: 'New order available', body: 'New order available for delivery from {bodegaName}' },
    },
    new_order_received: {
      es: { title: 'Nuevo pedido recibido', body: 'Pedido #{orderNumber} ha sido creado' },
      en: { title: 'New order received', body: 'Order #{orderNumber} has been created' },
    },
    order_status_ACCEPTED: {
      es: { title: 'Actualización de pedido', body: 'Tu pedido ha sido aceptado' },
      en: { title: 'Order update', body: 'Your order has been accepted' },
    },
    order_status_PREPARING: {
      es: { title: 'Actualización de pedido', body: 'Tu pedido se está preparando' },
      en: { title: 'Order update', body: 'Your order is being prepared' },
    },
    order_status_READY_FOR_PICKUP: {
      es: { title: 'Actualización de pedido', body: 'Tu pedido está listo para recoger' },
      en: { title: 'Order update', body: 'Your order is ready for pickup' },
    },
    order_status_PICKED_UP: {
      es: { title: 'Actualización de pedido', body: 'Tu pedido ha sido recogido para entrega' },
      en: { title: 'Order update', body: 'Your order has been picked up for delivery' },
    },
    order_status_IN_TRANSIT: {
      es: { title: 'Actualización de pedido', body: 'Tu pedido va en camino' },
      en: { title: 'Order update', body: 'Your order is on the way' },
    },
    order_status_DELIVERED: {
      es: { title: 'Actualización de pedido', body: 'Tu pedido ha sido entregado' },
      en: { title: 'Order update', body: 'Your order has been delivered' },
    },
    order_status_CANCELLED: {
      es: { title: 'Actualización de pedido', body: 'Tu pedido ha sido cancelado' },
      en: { title: 'Order update', body: 'Your order has been cancelled' },
    },
    delivery_assigned: {
      es: { title: 'Repartidor asignado', body: '{driverName} entregará tu pedido' },
      en: { title: 'Delivery person assigned', body: '{driverName} will deliver your order' },
    },
  };

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private websocketGateway: WebsocketGateway,
    private mapsService: MapsService,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      if (admin.apps.length === 0) {
        // Support both single JSON var and individual vars
        const serviceAccount = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
        const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
        const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
        const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

        if (serviceAccount) {
          admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(serviceAccount)),
          });
          this.logger.log('Firebase Admin initialized (from service account JSON)');
        } else if (projectId && privateKey && clientEmail) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              privateKey: privateKey.replace(/\\n/g, '\n'),
              clientEmail,
            }),
          });
          this.logger.log('Firebase Admin initialized (from individual env vars)');
        } else {
          this.logger.warn(
            'Firebase not configured. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL in .env',
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase:', error.message);
    }
  }

  async sendNotification(userId: string, title: string, body: string, type: string, data?: any, targetAppType?: string) {
    try {
      // Store notification in database with targetAppType so each app
      // can query only its own notifications
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          title,
          body,
          type,
          targetAppType: targetAppType || null,
          data: data || {},
        },
      });

      // Send push notification via FCM if tokens exist
      this.logger.log(`Notification created for user ${userId}: ${title} (target: ${targetAppType || 'all'})`);

      // Emit realtime notification to websocket clients
      this.websocketGateway.emitNotification(userId, notification);

      // Send push only to tokens matching the target app type
      const tokens = await this.getUserDeviceTokens(userId, targetAppType);
      if (tokens.length > 0) {
        await Promise.all(
          tokens.map((token) => this.sendPushNotification(token, title, body, data)),
        );
      }

      return notification;
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`);
      throw error;
    }
  }

  async sendBulkNotifications(
    userIds: string[],
    title: string,
    body: string,
    type: string,
    data?: any,
    targetAppType?: string,
  ) {
    const notifications = await Promise.all(
      userIds.map((userId) => this.sendNotification(userId, title, body, type, data, targetAppType)),
    );

    return notifications;
  }

  async findAll(userId: string, page: number = 1, limit: number = 20, appType?: string) {
    const skip = (page - 1) * limit;

    // Filter notifications by targetAppType: show notifications that either
    // match the requested appType OR have no targetAppType (generic/global notifications)
    const where: any = { userId };
    if (appType) {
      where.OR = [
        { targetAppType: appType },
        { targetAppType: null },
      ];
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount: await this.getUnreadCount(userId, appType),
      },
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return updated;
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { message: 'All notifications marked as read' };
  }

  async getUnreadCount(userId: string, appType?: string): Promise<number> {
    const where: any = {
      userId,
      isRead: false,
    };
    if (appType) {
      where.OR = [
        { targetAppType: appType },
        { targetAppType: null },
      ];
    }
    return this.prisma.notification.count({ where });
  }

  async deleteNotification(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id },
    });

    return { message: 'Notification deleted' };
  }

  async registerDeviceToken(userId: string, token: string, platform: string, appType?: string, locale?: string) {
    // Upsert by token (unique). If token exists, update ownership and mark active.
    const device = await this.prisma.notificationDevice.upsert({
      where: { token },
      update: {
        userId,
        platform,
        appType: appType || 'CLIENT',
        locale: locale || 'es',
        isActive: true,
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
        appType: appType || 'CLIENT',
        locale: locale || 'es',
        isActive: true,
        lastUsedAt: new Date(),
      },
    });

    this.logger.log(`Device token registered for user ${userId} (app: ${appType || 'CLIENT'}, platform: ${platform}, locale: ${locale || 'es'})`);
    return { message: 'Device token registered', deviceId: device.id };
  }

  private async getUserLocale(userId: string): Promise<string> {
    const device = await this.prisma.notificationDevice.findFirst({
      where: { userId, isActive: true },
      orderBy: { lastUsedAt: 'desc' },
      select: { locale: true },
    });
    return device?.locale || 'es';
  }

  private t(key: string, locale: string, params?: Record<string, string>): { title: string; body: string } {
    const lang = locale.startsWith('en') ? 'en' : 'es';
    const entry = this.i18n[key]?.[lang] || this.i18n[key]?.['es'] || { title: key, body: '' };
    let title = entry.title;
    let body = entry.body;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        title = title.replace(`{${k}}`, v);
        body = body.replace(`{${k}}`, v);
      }
    }
    return { title, body };
  }

  async getUserDeviceTokens(userId: string, appType?: string): Promise<string[]> {
    const where: any = { userId, isActive: true };
    if (appType) where.appType = appType;
    const devices = await this.prisma.notificationDevice.findMany({
      where,
      select: { token: true },
    });

    return devices.map((d) => d.token);
  }

  // Helper method to send push notifications via FCM
  private async sendPushNotification(fcmToken: string, title: string, body: string, data?: any) {
    try {
      // Ensure data values are strings (FCM requirement)
      const stringData: Record<string, string> = {};
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          stringData[key] = String(value);
        }
      }

      const message: admin.messaging.Message = {
        notification: {
          title,
          body,
        },
        data: stringData,
        token: fcmToken,
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'bodecart_channel',
            sound: 'default',
            defaultVibrateTimings: true,
            defaultSound: true,
            priority: 'high' as const,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`Push notification sent: ${response}`);
      return response;
    } catch (error) {
      // Handle stale/invalid FCM tokens
      const errorCode = (error as any)?.code || (error as any)?.errorInfo?.code;
      if (
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/invalid-argument'
      ) {
        this.logger.warn(`Stale FCM token detected, marking as inactive: ${fcmToken.substring(0, 20)}...`);
        await this.deactivateToken(fcmToken);
      } else {
        this.logger.error(`Failed to send push notification: ${error.message}`);
      }
    }
  }

  /**
   * Marks a device token as inactive so it won't be used for future notifications.
   */
  private async deactivateToken(token: string) {
    try {
      await this.prisma.notificationDevice.updateMany({
        where: { token },
        data: { isActive: false },
      });
    } catch (err) {
      this.logger.error(`Failed to deactivate token: ${err.message}`);
    }
  }

  /**
   * Notify delivery persons within range of the bodega about a new order available for delivery.
   * Uses Haversine distance filtering based on bodega.deliveryRadius.
   */
  async notifyNewOrderForDelivery(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        bodega: true,
      },
    });

    if (!order) return;

    const { bodega } = order;
    if (bodega.latitude == null || bodega.longitude == null) {
      this.logger.warn(`Bodega ${bodega.id} missing location data, skipping delivery notification`);
      return;
    }

    const deliveryRadius = bodega.deliveryRadius ?? 10.0;

    // Find all active, verified delivery persons with known location
    const deliveryPersons = await this.prisma.deliveryPerson.findMany({
      where: {
        isVerified: true,
        isAvailable: true,
        currentLat: { not: null },
        currentLng: { not: null },
      },
      select: { userId: true, currentLat: true, currentLng: true },
    });

    if (deliveryPersons.length === 0) {
      this.logger.log('No available delivery persons with location to notify about new order');
      return;
    }

    // Filter by distance from the bodega
    const nearbyUserIds = deliveryPersons
      .filter((dp) => {
        const distance = this.mapsService.calculateDistance(
          { latitude: bodega.latitude, longitude: bodega.longitude },
          { latitude: dp.currentLat!, longitude: dp.currentLng! },
        );
        return distance <= deliveryRadius;
      })
      .map((dp) => dp.userId);

    if (nearbyUserIds.length === 0) {
      this.logger.log(
        `No delivery persons within ${deliveryRadius}km of bodega ${bodega.name} for order ${orderId}`,
      );
      return;
    }

    this.logger.log(
      `Notifying ${nearbyUserIds.length}/${deliveryPersons.length} delivery persons within ${deliveryRadius}km of bodega ${bodega.name}`,
    );

    // Send individually to respect each delivery person's locale
    await Promise.all(
      nearbyUserIds.map(async (dpUserId) => {
        const locale = await this.getUserLocale(dpUserId);
        const { title, body: msgBody } = this.t('new_order_available', locale, { bodegaName: bodega.name });
        return this.sendNotification(
          dpUserId,
          title,
          msgBody,
          'delivery',
          { orderId: order.id, bodegaName: bodega.name },
          'DELIVERY_PERSON',
        );
      }),
    );
  }

  // Notification helpers for different events
  async notifyOrderCreated(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        bodega: {
          include: {
            owner: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (order) {
      const locale = await this.getUserLocale(order.bodega.owner.userId);
      const { title, body: msgBody } = this.t('new_order_received', locale, { orderNumber: order.orderNumber });
      await this.sendNotification(
        order.bodega.owner.userId,
        title,
        msgBody,
        'order',
        { orderId: order.id },
        'BODEGA_OWNER',
      );
    }
  }

  async notifyOrderStatusChanged(orderId: string, status: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          include: { user: true },
        },
      },
    });

    if (order) {
      const locale = await this.getUserLocale(order.client.userId);
      const i18nKey = `order_status_${status}`;
      const fallback = this.i18n[i18nKey]
        ? this.t(i18nKey, locale)
        : { title: locale.startsWith('en') ? 'Order update' : 'Actualización de pedido', body: `${status}` };
      await this.sendNotification(
        order.client.userId,
        fallback.title,
        fallback.body,
        'order',
        { orderId: order.id, status },
        'CLIENT',
      );
    }
  }

  async notifyDeliveryAssigned(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          include: {
            client: {
              include: { user: true },
            },
          },
        },
        deliveryPerson: {
          include: { user: true },
        },
      },
    });

    if (delivery && delivery.order) {
      const locale = await this.getUserLocale(delivery.order.client.userId);
      const { title, body: msgBody } = this.t('delivery_assigned', locale, {
        driverName: delivery.deliveryPerson.user.firstName,
      });
      await this.sendNotification(
        delivery.order.client.userId,
        title,
        msgBody,
        'delivery',
        { deliveryId: delivery.id },
        'CLIENT',
      );
    }
  }
}

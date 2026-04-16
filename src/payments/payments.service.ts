import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StripeProvider } from './providers/stripe.provider';
import { PayPalProvider } from './providers/paypal.provider';
import { CreatePaymentDto } from './dtos/create-payment.dto';
import { RefundPaymentDto } from './dtos/refund-payment.dto';
import {
  CreatePaymentIntentDto,
  CreatePayPalOrderDto,
  CapturePayPalOrderDto,
} from './dtos/payment-intent.dto';
import { PaymentMethod, PaymentStatus, UserRole, OrderStatus, Client } from '@prisma/client';
import { PaymentMethodResponseDto } from './dtos/payment-methods.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private stripeProvider: StripeProvider,
    private paypalProvider: PayPalProvider,
    private websocketGateway: WebsocketGateway,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Get Stripe publishable key for client-side initialization
   */
  getStripeConfig() {
    return {
      publishableKey: this.stripeProvider.getPublishableKey(),
    };
  }

  /**
   * Create a Stripe Payment Intent for client-side confirmation
   */
  async createPaymentIntent(dto: CreatePaymentIntentDto, userId: string) {
    const { amount, currency, orderId } = dto;

    let amountToCharge = amount;

    if (orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { client: { include: { user: true } }, payment: true },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.client.userId !== userId) {
        throw new ForbiddenException('You can only pay for your own orders');
      }

      // If payment already exists, block new intent
      if (order.payment) {
        throw new BadRequestException('Order already has a payment');
      }

      amountToCharge = order.total;

      if (amount && Math.abs(amount - order.total) > 0.01) {
        this.logger.warn(
          `Amount mismatch for order ${orderId}. Client sent ${amount}, using ${order.total}`,
        );
      }
    }

    // Look up the user's Stripe customer ID to attach to the PaymentIntent
    // This is required for using saved payment methods
    const client = await this.prisma.client.findFirst({
      where: { userId },
    });

    const metadata = orderId ? { orderId, userId } : { userId };
    let paymentIntent;

    if (client?.stripeCustomerId) {
      paymentIntent = await this.stripeProvider.createPaymentIntentWithCustomer(
        amountToCharge,
        currency || 'usd',
        client.stripeCustomerId,
        undefined,
        metadata,
      );
    } else {
      paymentIntent = await this.stripeProvider.createPaymentIntent(
        amountToCharge,
        currency || 'usd',
        metadata,
      );
    }

    this.logger.log(`Payment intent created: ${paymentIntent.id} for user ${userId}`);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  /**
   * Confirm a Stripe payment after Payment Sheet completes
   * This creates the payment record in our database
   */
  async confirmStripePayment(orderId: string, paymentIntentId: string, userId: string) {
    // Verify the order exists and belongs to this user
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: { include: { user: true } },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.client.userId !== userId) {
      throw new ForbiddenException('You can only confirm payment for your own orders');
    }

    // If payment record already exists, just return it
    if (order.payment) {
      this.logger.log(`Payment already exists for order ${orderId}`);
      return order.payment;
    }

    // Retrieve the payment intent from Stripe to verify it succeeded
    const paymentIntent = await this.stripeProvider.retrievePaymentIntent(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(`Payment intent status is ${paymentIntent.status}, not succeeded`);
    }

    // Create the payment record
    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        amount: order.total,
        method: 'CREDIT_CARD',
        status: 'COMPLETED',
        stripePaymentId: paymentIntentId,
        transactionId: paymentIntentId,
        completedAt: new Date(),
      },
      include: {
        order: {
          include: {
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
            bodega: true,
          },
        },
      },
    });

    this.logger.log(`Payment confirmed for order ${order.orderNumber}: ${payment.id}`);

    // NOW notify bodeguero and repartidores (payment is confirmed)
    this.websocketGateway.emitNewOrderToBodega(order.bodegaId, order);
    this.websocketGateway.emitNewOrderToDeliveryPersons(order);

    this.notificationsService.notifyOrderCreated(order.id).catch((err) => {
      this.logger.error(`Failed to send push for order ${order.orderNumber}: ${err.message}`);
    });
    this.notificationsService.notifyNewOrderForDelivery(order.id).catch((err) => {
      this.logger.error(`Failed to notify delivery persons for order ${order.orderNumber}: ${err.message}`);
    });

    return payment;
  }

  /**
   * Create a PayPal order for checkout
   */
  async createPayPalOrder(dto: CreatePayPalOrderDto, userId: string) {
    const { currency, orderId, returnUrl, cancelUrl } = dto;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { client: { include: { user: true } }, payment: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.client.userId !== userId) {
      throw new ForbiddenException('You can only pay for your own orders');
    }

    if (order.payment) {
      throw new BadRequestException('Order already has a payment');
    }

    const result = await this.paypalProvider.createOrder(
      order.total,
      currency || 'USD',
      orderId,
      returnUrl,
      cancelUrl,
    );

    this.logger.log(`PayPal order created: ${result.orderId} for user ${userId}`);

    return {
      paypalOrderId: result.orderId,
      approvalUrl: result.approvalUrl,
    };
  }

  /**
   * Capture a PayPal order after user approval
   */
  async capturePayPalOrder(dto: CapturePayPalOrderDto, userId: string) {
    const { paypalOrderId, orderId } = dto;

    const result = await this.paypalProvider.captureOrder(paypalOrderId);

    this.logger.log(`PayPal order captured: ${paypalOrderId} for order ${orderId}`);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: { include: { user: true } },
        payment: true,
        bodega: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.client.userId !== userId) {
      throw new ForbiddenException('You can only capture payments for your own orders');
    }

    if (!order.payment) {
      await this.prisma.payment.create({
        data: {
          orderId,
          amount: order.total,
          method: PaymentMethod.PAYPAL,
          status: PaymentStatus.COMPLETED,
          paypalOrderId,
          transactionId: result.captureId,
          completedAt: new Date(),
        },
      });

      // Notify bodeguero and repartidores (payment confirmed)
      this.websocketGateway.emitNewOrderToBodega(order.bodegaId, order);
      this.websocketGateway.emitNewOrderToDeliveryPersons(order);

      this.notificationsService.notifyOrderCreated(order.id).catch((err) => {
        this.logger.error(`Failed to send push for order ${order.orderNumber}: ${err.message}`);
      });
      this.notificationsService.notifyNewOrderForDelivery(order.id).catch((err) => {
        this.logger.error(`Failed to notify delivery persons for order ${order.orderNumber}: ${err.message}`);
      });
    }

    return {
      captureId: result.captureId,
      status: result.status,
      amount: result.amount,
    };
  }

  async create(createPaymentDto: CreatePaymentDto, userId: string) {
    const { orderId, method, paymentMethodId, paypalOrderId, metadata } = createPaymentDto;

    // Get order and verify ownership
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          include: { user: true },
        },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.client.userId !== userId) {
      throw new ForbiddenException('You can only pay for your own orders');
    }

    if (order.payment) {
      throw new BadRequestException('Order already has a payment');
    }

    if (order.status !== OrderStatus.PLACED) {
      throw new BadRequestException('Can only pay for pending orders');
    }

    const paymentData: any = {
      orderId,
      amount: order.total,
      method,
      status: PaymentStatus.PENDING,
      metadata,
    };

    // Handle payment based on method
    if (method === PaymentMethod.CREDIT_CARD || method === PaymentMethod.DEBIT_CARD) {
      if (!paymentMethodId) {
        throw new BadRequestException('Payment method ID is required for card payments');
      }

      try {
        // Get Stripe customer ID (saved cards are attached to a customer)
        const stripeCustomerId = await this.getOrCreateStripeCustomer(userId);

        // Create payment intent with customer and payment method
        const paymentIntent = await this.stripeProvider.createPaymentIntentWithCustomer(
          order.total,
          'usd',
          stripeCustomerId,
          paymentMethodId,
          {
            orderId: order.id,
            orderNumber: order.orderNumber,
            clientId: order.clientId,
          },
        );

        // Confirm payment
        const confirmedIntent = await this.stripeProvider.confirmPayment(
          paymentIntent.id,
          paymentMethodId,
        );

        paymentData.stripePaymentId = confirmedIntent.id;
        paymentData.transactionId = confirmedIntent.id;
        paymentData.status =
          confirmedIntent.status === 'succeeded'
            ? PaymentStatus.COMPLETED
            : PaymentStatus.PROCESSING;

        if (confirmedIntent.status === 'succeeded') {
          paymentData.completedAt = new Date();
        }
      } catch (error) {
        this.logger.error(`Stripe payment failed: ${error.message}`);
        paymentData.status = PaymentStatus.FAILED;

        // Auto-cancel the order and restore stock
        await this.cancelOrderOnPaymentFailure(order);
      }
    } else if (method === PaymentMethod.PAYPAL) {
      if (!paypalOrderId) {
        throw new BadRequestException('PayPal order ID is required for PayPal payments');
      }

      // In production, verify PayPal payment here
      paymentData.paypalOrderId = paypalOrderId;
      paymentData.transactionId = paypalOrderId;
      paymentData.status = PaymentStatus.COMPLETED;
      paymentData.completedAt = new Date();
    } else if (method === PaymentMethod.VENMO) {
      // Venmo integration would go here
      paymentData.status = PaymentStatus.PENDING;
    } else if (method === PaymentMethod.CASH) {
      paymentData.status = PaymentStatus.PENDING;
    }

    const payment = await this.prisma.payment.create({
      data: paymentData,
      include: {
        order: {
          include: {
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
            bodega: true,
          },
        },
      },
    });

    this.logger.log(`Payment created for order ${order.orderNumber}: ${payment.id} (status: ${paymentData.status})`);

    // Only notify bodeguero and repartidores if payment succeeded
    if (paymentData.status === PaymentStatus.COMPLETED) {
      this.websocketGateway.emitNewOrderToBodega(order.bodegaId, order);
      this.websocketGateway.emitNewOrderToDeliveryPersons(order);

      this.notificationsService.notifyOrderCreated(order.id).catch((err) => {
        this.logger.error(`Failed to send push for order ${order.orderNumber}: ${err.message}`);
      });
      this.notificationsService.notifyNewOrderForDelivery(order.id).catch((err) => {
        this.logger.error(`Failed to notify delivery persons for order ${order.orderNumber}: ${err.message}`);
      });
    }

    return payment;
  }

  async findOne(id: string, userId: string, userRole: UserRole) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            client: {
              include: { user: true },
            },
            bodega: {
              include: {
                owner: {
                  include: { user: true },
                },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Check permissions
    if (userRole === UserRole.CLIENT) {
      if (payment.order.client.userId !== userId) {
        throw new ForbiddenException('You can only view your own payments');
      }
    } else if (userRole === UserRole.BODEGA_OWNER) {
      if (payment.order.bodega.owner.userId !== userId) {
        throw new ForbiddenException('You can only view payments for your orders');
      }
    }

    return payment;
  }

  async findByOrder(orderId: string, userId: string, userRole: UserRole) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: { include: { user: true } },
        bodega: { include: { owner: { include: { user: true } } } },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check permissions
    if (userRole === UserRole.CLIENT) {
      if (order.client.userId !== userId) {
        throw new ForbiddenException('You can only view your own order payments');
      }
    } else if (userRole === UserRole.BODEGA_OWNER) {
      if (order.bodega.owner.userId !== userId) {
        throw new ForbiddenException('You can only view payments for your orders');
      }
    }

    return order.payment;
  }

  async refund(id: string, refundPaymentDto: RefundPaymentDto, userId: string, userRole: UserRole) {
    const { amount, reason } = refundPaymentDto;

    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            client: { include: { user: true } },
            bodega: { include: { owner: { include: { user: true } } } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Can only refund completed payments');
    }

    // Check permissions (only admin or bodega owner can refund)
    if (userRole === UserRole.BODEGA_OWNER) {
      if (payment.order.bodega.owner.userId !== userId) {
        throw new ForbiddenException('You can only refund payments for your orders');
      }
    } else if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only bodega owners or admins can issue refunds');
    }

    // Process refund based on payment method
    if (payment.stripePaymentId) {
      try {
        await this.stripeProvider.createRefund(payment.stripePaymentId, amount, reason);
      } catch (error) {
        this.logger.error(`Stripe refund failed: ${error.message}`);
        throw new BadRequestException('Failed to process refund');
      }
    }

    // Update payment and order status
    const updatedPayment = await this.prisma.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.REFUNDED,
        metadata: {
          ...(payment.metadata as object),
          refundReason: reason,
          refundAmount: amount || payment.amount,
          refundedAt: new Date(),
        },
      },
    });

    await this.prisma.order.update({
      where: { id: payment.orderId },
      data: {
        status: OrderStatus.REFUNDED,
      },
    });

    this.logger.log(`Payment refunded: ${payment.id}`);

    return updatedPayment;
  }

  async webhookHandler(event: any) {
    // Handle Stripe webhooks
    this.logger.log(`Received webhook event: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await this.handleRefund(event.data.object);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handlePaymentSuccess(paymentIntent: any) {
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentId: paymentIntent.id },
    });

    if (payment && payment.status !== PaymentStatus.COMPLETED) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Payment completed: ${payment.id}`);
    }
  }

  private async handlePaymentFailed(paymentIntent: any) {
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentId: paymentIntent.id },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
        },
      });

      this.logger.log(`Payment failed: ${payment.id}`);
    }
  }

  private async handleRefund(charge: any) {
    this.logger.log(`Refund processed for charge: ${charge.id}`);
  }

  // ============================================
  // SAVED PAYMENT METHODS (Cards)
  // ============================================

  /**
   * Get or create a Stripe Customer for the user
   */
  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const client = await this.prisma.client.findFirst({
      where: { userId },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (client.stripeCustomerId) {
      return client.stripeCustomerId;
    }

    const customer = await this.stripeProvider.createCustomer(
      client.user.email,
      `${client.user.firstName} ${client.user.lastName}`,
    );

    await this.prisma.client.update({
      where: { id: client.id },
      data: { stripeCustomerId: customer.id },
    });

    this.logger.log(`Stripe customer created: ${customer.id} for user ${userId}`);
    return customer.id;
  }

  /**
   * Create a SetupIntent for saving a card without immediate payment
   */
  async createSetupIntent(userId: string) {
    this.logger.log(`Creating SetupIntent for user: ${userId}`);

    try {
      const stripeCustomerId = await this.getOrCreateStripeCustomer(userId);
      this.logger.log(`Stripe customer ID: ${stripeCustomerId}`);

      const setupIntent = await this.stripeProvider.createSetupIntent(stripeCustomerId);
      this.logger.log(`SetupIntent created: ${setupIntent.id}, client_secret exists: ${!!setupIntent.client_secret}`);

      return {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
        customerId: stripeCustomerId,
      };
    } catch (error) {
      this.logger.error(`Failed to create SetupIntent: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * List saved payment methods (cards) for a user
   */
  async listPaymentMethods(userId: string) {
    const client = await this.prisma.client.findFirst({
      where: { userId },
    });

    if (!client || !client.stripeCustomerId) {
      return { paymentMethods: [], defaultPaymentMethodId: null };
    }

    const paymentMethods = await this.stripeProvider.listPaymentMethods(client.stripeCustomerId);

    const cards = paymentMethods.map(pm => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      created: pm.created,
      isDefault: pm.id === client.defaultPaymentMethodId,
    }));

    this.logger.log(`Listed ${cards.length} payment methods for user ${userId}`);

    return {
      paymentMethods: cards,
      defaultPaymentMethodId: client.defaultPaymentMethodId,
    };
  }

  /**
   * Delete a saved payment method
   */
  async deletePaymentMethod(userId: string, paymentMethodId: string) {
    const client = await this.prisma.client.findFirst({
      where: { userId },
    });

    if (!client || !client.stripeCustomerId) {
      throw new NotFoundException('No payment methods found');
    }

    const paymentMethods = await this.stripeProvider.listPaymentMethods(client.stripeCustomerId);
    const belongsToUser = paymentMethods.some(pm => pm.id === paymentMethodId);

    if (!belongsToUser) {
      throw new ForbiddenException('Payment method does not belong to this user');
    }

    await this.stripeProvider.detachPaymentMethod(paymentMethodId);

    if (client.defaultPaymentMethodId === paymentMethodId) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { defaultPaymentMethodId: null },
      });
    }

    this.logger.log(`Payment method deleted: ${paymentMethodId} for user ${userId}`);

    return { message: 'Payment method deleted successfully' };
  }

  /**
   * Set a payment method as the default
   */
  async setDefaultPaymentMethod(userId: string, paymentMethodId: string) {
    const client = await this.prisma.client.findFirst({
      where: { userId },
    });

    if (!client || !client.stripeCustomerId) {
      throw new NotFoundException('No payment methods found');
    }

    const paymentMethods = await this.stripeProvider.listPaymentMethods(client.stripeCustomerId);
    const belongsToUser = paymentMethods.some(pm => pm.id === paymentMethodId);

    if (!belongsToUser) {
      throw new ForbiddenException('Payment method does not belong to this user');
    }

    await this.prisma.client.update({
      where: { id: client.id },
      data: { defaultPaymentMethodId: paymentMethodId },
    });

    this.logger.log(`Default payment method set: ${paymentMethodId} for user ${userId}`);

    return { message: 'Default payment method updated successfully' };
  }

  /**
   * Auto-cancel an order when payment fails. Restores product stock.
   */
  private async cancelOrderOnPaymentFailure(order: any) {
    try {
      // Cancel the order
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: 'Pago fallido - cancelado automáticamente',
        },
      });

      // Restore product stock
      const items = await this.prisma.orderItem.findMany({
        where: { orderId: order.id },
      });
      for (const item of items) {
        await this.prisma.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      this.logger.log(`Order ${order.orderNumber} auto-cancelled due to payment failure`);
    } catch (err) {
      this.logger.error(`Failed to auto-cancel order ${order.id}: ${err.message}`);
    }
  }
}

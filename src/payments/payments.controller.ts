import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dtos/create-payment.dto';
import { RefundPaymentDto } from './dtos/refund-payment.dto';
import { PaymentDto } from './dtos/payment.dto';
import {
  CreatePaymentIntentDto,
  CreatePayPalOrderDto,
  CapturePayPalOrderDto,
} from './dtos/payment-intent.dto';
import {
  PaymentMethodResponseDto,
  SavePaymentMethodDto,
  SetupIntentResponseDto,
} from './dtos/payment-methods.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('stripe-config')
  @ApiOperation({ summary: 'Get Stripe publishable key for client-side initialization' })
  @ApiResponse({ status: 200, description: 'Returns Stripe publishable key' })
  getStripeConfig() {
    return this.paymentsService.getStripeConfig();
  }

  // ============================================
  // SAVED PAYMENT METHODS (Cards) - Must be before :id route
  // ============================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Post('setup-intent')
  @ApiOperation({ summary: 'Create a SetupIntent for saving a card' })
  @ApiResponse({ status: 201, description: 'SetupIntent created' })
  async createSetupIntent(@CurrentUser() user: any) {
    return this.paymentsService.createSetupIntent(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Get('payment-methods')
  @ApiOperation({ summary: 'List saved payment methods (cards)' })
  @ApiResponse({ status: 200, description: 'Returns list of saved cards' })
  async listPaymentMethods(@CurrentUser() user: any) {
    return this.paymentsService.listPaymentMethods(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Delete('payment-methods/:paymentMethodId')
  @ApiOperation({ summary: 'Delete a saved payment method' })
  @ApiResponse({ status: 200, description: 'Payment method deleted' })
  async deletePaymentMethod(
    @Param('paymentMethodId') paymentMethodId: string,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.deletePaymentMethod(user.id, paymentMethodId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Post('payment-methods/:paymentMethodId/set-default')
  @ApiOperation({ summary: 'Set a payment method as default' })
  @ApiResponse({ status: 200, description: 'Default payment method updated' })
  async setDefaultPaymentMethod(
    @Param('paymentMethodId') paymentMethodId: string,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.setDefaultPaymentMethod(user.id, paymentMethodId);
  }

  // ============================================
  // PAYMENT INTENTS
  // ============================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Post('create-payment-intent')
  @ApiOperation({ summary: 'Create a Stripe Payment Intent' })
  @ApiResponse({ status: 201, description: 'Payment Intent created' })
  async createPaymentIntent(@Body() dto: CreatePaymentIntentDto, @CurrentUser() user: any) {
    return this.paymentsService.createPaymentIntent(dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Post('confirm-stripe-payment')
  @ApiOperation({ summary: 'Confirm Stripe payment and create payment record' })
  @ApiResponse({ status: 201, description: 'Payment confirmed and recorded' })
  async confirmStripePayment(
    @Body() dto: { orderId: string; paymentIntentId: string },
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.confirmStripePayment(dto.orderId, dto.paymentIntentId, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Post('create-paypal-order')
  @ApiOperation({ summary: 'Create a PayPal order for checkout' })
  @ApiResponse({ status: 201, description: 'PayPal order created' })
  async createPayPalOrder(@Body() dto: CreatePayPalOrderDto, @CurrentUser() user: any) {
    return this.paymentsService.createPayPalOrder(dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Post('capture-paypal-order')
  @ApiOperation({ summary: 'Capture a PayPal order after user approval' })
  @ApiResponse({ status: 200, description: 'PayPal order captured' })
  async capturePayPalOrder(@Body() dto: CapturePayPalOrderDto, @CurrentUser() user: any) {
    return this.paymentsService.capturePayPalOrder(dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @Post()
  @ApiOperation({ summary: 'Create a payment for an order (Client only)' })
  @ApiResponse({
    status: 201,
    description: 'Payment created successfully',
    type: PaymentDto,
  })
  async create(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    return this.paymentsService.create(createPaymentDto, user.id);
  }

  // ============================================
  // PAYMENTS BY ID - Must come after static routes
  // ============================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.BODEGA_OWNER, UserRole.ADMIN)
  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get payment for an order' })
  @ApiResponse({ status: 200, description: 'Payment found', type: PaymentDto })
  async findByOrder(@Param('orderId') orderId: string, @CurrentUser() user: any) {
    return this.paymentsService.findByOrder(orderId, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.BODEGA_OWNER, UserRole.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiResponse({ status: 200, description: 'Payment found', type: PaymentDto })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.findOne(id, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER, UserRole.ADMIN)
  @Post(':id/refund')
  @ApiOperation({ summary: 'Refund a payment (Bodega Owner or Admin only)' })
  @ApiResponse({ status: 200, description: 'Payment refunded successfully' })
  async refund(
    @Param('id') id: string,
    @Body() refundPaymentDto: RefundPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.refund(id, refundPaymentDto, user.id, user.role);
  }

}

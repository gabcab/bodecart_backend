import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, DocumentStatus } from '@prisma/client';
import { UpdateSystemSettingsDto } from './dtos';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============================================
  // GLOBAL STATISTICS
  // ============================================

  @Get('stats')
  @ApiOperation({ summary: 'Get global platform statistics (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Returns global statistics',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number', example: 1234 },
        totalClients: { type: 'number', example: 1000 },
        totalBodegaOwners: { type: 'number', example: 200 },
        totalDeliveryPersons: { type: 'number', example: 34 },
        totalBodegas: { type: 'number', example: 150 },
        verifiedBodegas: { type: 'number', example: 120 },
        totalOrders: { type: 'number', example: 5000 },
        activeOrders: { type: 'number', example: 45 },
        totalRevenue: { type: 'number', example: 125000.5 },
        pendingDocuments: { type: 'number', example: 12 },
      },
    },
  })
  async getGlobalStats() {
    return this.adminService.getGlobalStats();
  }

  // ============================================
  // ANALYTICS
  // ============================================

  @Get('analytics')
  @ApiOperation({ summary: 'Get global platform analytics (Admin only)' })
  @ApiQuery({ name: 'startDate', required: false, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2024-12-31' })
  @ApiResponse({
    status: 200,
    description: 'Returns analytics data with charts',
  })
  async getAnalytics(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.adminService.getAnalytics({ startDate, endDate });
  }

  // ============================================
  // BODEGAS MANAGEMENT
  // ============================================

  @Get('bodegas')
  @ApiOperation({ summary: 'Get all bodegas with filters (Admin only)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isVerified', required: false, type: Boolean })
  @ApiQuery({ name: 'ownerId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAdminBodegas(
    @Query('search') search?: string,
    @Query('isVerified') isVerified?: string,
    @Query('ownerId') ownerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAdminBodegas({
      search,
      isVerified: isVerified === 'true' ? true : isVerified === 'false' ? false : undefined,
      ownerId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  // ============================================
  // DELIVERY PERSONS MANAGEMENT
  // ============================================

  @Get('delivery-persons')
  @ApiOperation({ summary: 'Get all delivery persons with filters (Admin only)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isVerified', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDeliveryPersons(
    @Query('search') search?: string,
    @Query('isVerified') isVerified?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getDeliveryPersons({
      search,
      isVerified: isVerified === 'true' ? true : isVerified === 'false' ? false : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('delivery-persons/:id')
  @ApiOperation({ summary: 'Get delivery person details (Admin only)' })
  async getDeliveryPerson(@Param('id') id: string) {
    return this.adminService.getDeliveryPerson(id);
  }

  @Patch('delivery-persons/:id/verify')
  @ApiOperation({ summary: 'Verify or unverify a delivery person (Admin only)' })
  async verifyDeliveryPerson(
    @Param('id') id: string,
    @Body() body: { isVerified: boolean },
  ) {
    return this.adminService.verifyDeliveryPerson(id, body.isVerified);
  }

  // ============================================
  // DOCUMENTS MANAGEMENT
  // ============================================

  @Get('documents')
  @ApiOperation({ summary: 'Get all documents with filters (Admin only)' })
  @ApiQuery({ name: 'userType', required: false, enum: ['bodega', 'delivery', 'all'] })
  @ApiQuery({ name: 'status', required: false, enum: DocumentStatus })
  @ApiQuery({ name: 'type', required: false, example: 'BUSINESS_LICENSE' })
  @ApiQuery({ name: 'bodegaId', required: false })
  @ApiQuery({ name: 'deliveryPersonId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated documents list',
  })
  async getDocuments(
    @Query('userType') userType?: 'bodega' | 'delivery' | 'all',
    @Query('status') status?: DocumentStatus,
    @Query('type') type?: string,
    @Query('bodegaId') bodegaId?: string,
    @Query('deliveryPersonId') deliveryPersonId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getDocuments({
      userType,
      status,
      type,
      bodegaId,
      deliveryPersonId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  // ============================================
  // VERIFICATION QUEUE
  // ============================================

  @Get('verification-queue')
  @ApiOperation({ summary: 'Get verification queue with filters (Admin only)' })
  @ApiQuery({
    name: 'userType',
    required: false,
    enum: ['BODEGA_OWNER', 'DELIVERY_PERSON', 'ALL'],
    example: 'ALL',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'ALL'],
    example: 'PENDING',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated verification queue',
  })
  async getVerificationQueue(
    @Query('userType') userType?: 'BODEGA_OWNER' | 'DELIVERY_PERSON' | 'ALL',
    @Query('status') status?: DocumentStatus | 'ALL',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getVerificationQueue({
      userType,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('users/:userId/documents')
  @ApiOperation({ summary: 'Get all documents for a specific user (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns user information and all documents',
  })
  async getUserDocuments(@Param('userId') userId: string) {
    return this.adminService.getUserDocuments(userId);
  }

  // ============================================
  // DOCUMENT APPROVAL/REJECTION
  // ============================================

  @Post('documents/bodega/:documentId/approve')
  @ApiOperation({ summary: 'Approve a bodega document (Admin only)' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({
    status: 200,
    description: 'Document approved successfully',
  })
  async approveBodegaDocument(@Param('documentId') documentId: string, @CurrentUser() user: any) {
    return this.adminService.approveDocument(documentId, user.id, 'bodega');
  }

  @Post('documents/bodega/:documentId/reject')
  @ApiOperation({ summary: 'Reject a bodega document (Admin only)' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({
    status: 200,
    description: 'Document rejected successfully',
  })
  async rejectBodegaDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Body() body: { reason: string },
  ) {
    return this.adminService.rejectDocument(documentId, user.id, body.reason, 'bodega');
  }

  @Post('documents/delivery/:documentId/approve')
  @ApiOperation({ summary: 'Approve a delivery person document (Admin only)' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({
    status: 200,
    description: 'Document approved successfully',
  })
  async approveDeliveryDocument(@Param('documentId') documentId: string, @CurrentUser() user: any) {
    return this.adminService.approveDocument(documentId, user.id, 'delivery');
  }

  @Post('documents/delivery/:documentId/reject')
  @ApiOperation({ summary: 'Reject a delivery person document (Admin only)' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({
    status: 200,
    description: 'Document rejected successfully',
  })
  async rejectDeliveryDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Body() body: { reason: string },
  ) {
    return this.adminService.rejectDocument(documentId, user.id, body.reason, 'delivery');
  }

  // ============================================
  // SYSTEM SETTINGS
  // ============================================

  @Get('settings')
  @ApiOperation({ summary: 'Get system settings (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Returns system settings',
    schema: {
      type: 'object',
      properties: {
        taxRate: { type: 'number', example: 8.5 },
        baseDeliveryFee: { type: 'number', example: 2.99 },
        perKmDeliveryFee: { type: 'number', example: 0.5 },
        platformCommission: { type: 'number', example: 10.0 },
        enabledPaymentMethods: {
          type: 'array',
          items: { type: 'string' },
          example: ['CREDIT_CARD', 'DEBIT_CARD', 'CASH'],
        },
        maintenanceMode: { type: 'boolean', example: false },
      },
    },
  })
  async getSystemSettings() {
    return this.adminService.getSystemSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update system settings (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Settings updated successfully',
  })
  async updateSystemSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.adminService.updateSystemSettings(dto);
  }

  // ============================================
  // STRIPE REVENUE & TRANSACTIONS
  // ============================================

  @Get('stripe/revenue')
  @ApiOperation({ summary: 'Get total revenue from Stripe (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Returns total revenue from successful Stripe charges',
    schema: {
      type: 'object',
      properties: {
        totalRevenue: { type: 'number', example: 12500.50 },
        totalCharges: { type: 'number', example: 150 },
        currency: { type: 'string', example: 'usd' },
      },
    },
  })
  async getStripeRevenue() {
    return this.adminService.getStripeRevenue();
  }

  @Get('stripe/transactions')
  @ApiOperation({ summary: 'Get Stripe transactions/charges (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'startingAfter', required: false, description: 'Cursor for pagination' })
  @ApiQuery({ name: 'startDate', required: false, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2024-12-31' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of Stripe transactions',
  })
  async getStripeTransactions(
    @Query('limit') limit?: string,
    @Query('startingAfter') startingAfter?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getStripeTransactions({
      limit: limit ? parseInt(limit) : undefined,
      startingAfter,
      startDate,
      endDate,
    });
  }

  @Get('stripe/balance')
  @ApiOperation({ summary: 'Get Stripe account balance (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Returns Stripe account balance',
  })
  async getStripeBalance() {
    return this.adminService.getStripeBalance();
  }

  @Post('orders/:id/force-cancel')
  @ApiOperation({ summary: 'Force cancel an order and its delivery (Admin only)' })
  @ApiResponse({ status: 200, description: 'Order force-cancelled' })
  async forceCancelOrder(
    @Param('id') orderId: string,
    @Body() body: { reason?: string },
  ) {
    return this.adminService.forceCancelOrder(orderId, body.reason);
  }

  @Post('orders/:id/force-delete')
  @ApiOperation({ summary: 'Force delete a cancelled order (Admin only)' })
  @ApiResponse({ status: 200, description: 'Cancelled order deleted' })
  async forceDeleteOrder(@Param('id') orderId: string) {
    return this.adminService.forceDeleteOrder(orderId);
  }
}

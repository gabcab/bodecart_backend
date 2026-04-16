import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { PayoutsService } from './payouts.service';
import { CreateConnectedAccountDto, CreateAccountLinkDto } from './dtos/create-connected-account.dto';
import { CreatePayoutDto, CreateBulkPayoutDto } from './dtos/create-payout.dto';
import { PayoutQueryDto, EarningsQueryDto } from './dtos/payout-query.dto';
import { UpdatePayoutScheduleDto } from './dtos/update-payout-schedule.dto';
import { PayoutMethod } from '@prisma/client';

@ApiTags('Payouts')
@Controller('payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  // ==================== STRIPE CONNECT ONBOARDING ====================

  @Post('connect/account')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Create a Stripe Connect account' })
  @ApiResponse({ status: 201, description: 'Stripe account created' })
  async createConnectedAccount(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateConnectedAccountDto,
  ) {
    return this.payoutsService.createConnectedAccount(user.id, user.role, dto);
  }

  @Post('connect/account-link')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Generate Stripe onboarding link' })
  @ApiResponse({ status: 200, description: 'Account link generated' })
  async createAccountLink(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateAccountLinkDto,
  ) {
    return this.payoutsService.createAccountLink(user.id, user.role, dto);
  }

  @Get('connect/login-link')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Get Stripe Express Dashboard login link' })
  @ApiResponse({ status: 200, description: 'Login link generated' })
  async getLoginLink(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.payoutsService.getLoginLink(user.id, user.role);
  }

  @Get('connect/status')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Get Stripe Connect account status' })
  @ApiResponse({ status: 200, description: 'Account status retrieved' })
  async getAccountStatus(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.payoutsService.getAccountStatus(user.id, user.role);
  }

  @Post('connect/refresh-status')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Stripe Connect account status from Stripe' })
  @ApiResponse({ status: 200, description: 'Status refreshed' })
  async refreshAccountStatus(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.payoutsService.refreshAccountStatus(user.id, user.role);
  }

  // ==================== USER EARNINGS & PAYOUTS ====================

  @Get('earnings')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Get my earnings' })
  @ApiResponse({ status: 200, description: 'Earnings retrieved' })
  async getMyEarnings(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: EarningsQueryDto,
  ) {
    return this.payoutsService.getMyEarnings(user.id, user.role, query);
  }

  @Get('earnings/summary')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Get earnings summary' })
  @ApiResponse({ status: 200, description: 'Earnings summary retrieved' })
  async getEarningsSummary(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.payoutsService.getEarningsSummary(user.id, user.role);
  }

  @Get('history')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Get my payout history' })
  @ApiResponse({ status: 200, description: 'Payout history retrieved' })
  async getMyPayouts(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: PayoutQueryDto,
  ) {
    return this.payoutsService.getMyPayouts(user.id, user.role, query);
  }

  // ==================== ADMIN ENDPOINTS ====================

  @Get('admin/earnings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all earnings (admin only)' })
  @ApiResponse({ status: 200, description: 'All earnings retrieved' })
  async getAllEarnings(@Query() query: PayoutQueryDto) {
    return this.payoutsService.getAllEarnings(query);
  }

  @Get('admin/payouts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all payouts (admin only)' })
  @ApiResponse({ status: 200, description: 'All payouts retrieved' })
  async getAllPayouts(@Query() query: PayoutQueryDto) {
    return this.payoutsService.getAllPayouts(query);
  }

  @Get('admin/summary')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get payout summary by user type' })
  @ApiResponse({ status: 200, description: 'Summary retrieved' })
  async getPayoutSummary() {
    return this.payoutsService.getPayoutSummary();
  }

  @Get('admin/connected-accounts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all connected Stripe accounts' })
  @ApiResponse({ status: 200, description: 'Connected accounts retrieved' })
  async getConnectedAccounts(@Query() query: PayoutQueryDto) {
    return this.payoutsService.getConnectedAccounts(query);
  }

  @Post('admin/payout')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a payout for a specific user' })
  @ApiResponse({ status: 201, description: 'Payout created' })
  async createPayout(@Body() dto: CreatePayoutDto) {
    return this.payoutsService.createPayout(dto);
  }

  @Post('admin/bulk-payout')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Process bulk payouts' })
  @ApiResponse({ status: 200, description: 'Bulk payouts processed' })
  @HttpCode(HttpStatus.OK)
  async processBulkPayouts(@Body() dto: CreateBulkPayoutDto) {
    return this.payoutsService.processBulkPayouts(dto);
  }

  @Get('admin/platform-commissions')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get platform commission summary' })
  @ApiResponse({ status: 200, description: 'Platform commissions retrieved' })
  async getPlatformCommissions() {
    return this.payoutsService.getPlatformCommissions();
  }

  @Get('admin/schedule')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get payout schedule settings' })
  @ApiResponse({ status: 200, description: 'Schedule settings retrieved' })
  async getPayoutSchedule() {
    return this.payoutsService.getPayoutSchedule();
  }

  @Patch('admin/schedule')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update payout schedule settings' })
  @ApiResponse({ status: 200, description: 'Schedule settings updated' })
  @HttpCode(HttpStatus.OK)
  async updatePayoutSchedule(@Body() dto: UpdatePayoutScheduleDto) {
    return this.payoutsService.updatePayoutSchedule(dto);
  }

  // ==================== PAYOUT METHOD PREFERENCES ====================

  @Get('payout-method')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Get current payout method preference' })
  @ApiResponse({ status: 200, description: 'Payout method preference retrieved' })
  async getPayoutMethod(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.payoutsService.getPayoutMethodPreference(user.id, user.role);
  }

  @Patch('payout-method')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set preferred payout method (STRIPE, PAYPAL)' })
  @ApiResponse({ status: 200, description: 'Payout method updated' })
  async setPayoutMethod(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: { method: string },
  ) {
    return this.payoutsService.setPayoutMethodPreference(user.id, user.role, dto);
  }
}

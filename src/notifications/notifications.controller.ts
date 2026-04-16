import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  UseGuards,
  Query,
  ParseIntPipe,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationDto } from './dtos/notification.dto';
import { RegisterDeviceDto } from './dtos/register-device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications for current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'appType', required: false, type: String, description: 'Filter by target app: CLIENT | BODEGA_OWNER | DELIVERY_PERSON' })
  @ApiResponse({ status: 200, description: 'List of notifications', type: [NotificationDto] })
  async findAll(
    @CurrentUser() user: any,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('appType') appType?: string,
  ) {
    return this.notificationsService.findAll(user.id, page, limit, appType);
  }

  @Post('device-token')
  @ApiOperation({ summary: 'Register or update device token for push notifications' })
  @ApiResponse({ status: 200, description: 'Device token registered' })
  async registerDeviceToken(@CurrentUser() user: any, @Body() dto: RegisterDeviceDto) {
    return this.notificationsService.registerDeviceToken(user.id, dto.token, dto.platform, dto.appType, dto.locale);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiQuery({ name: 'appType', required: false, type: String, description: 'Filter by target app: CLIENT | BODEGA_OWNER | DELIVERY_PERSON' })
  @ApiResponse({ status: 200, description: 'Unread count' })
  async getUnreadCount(@CurrentUser() user: any, @Query('appType') appType?: string) {
    const count = await this.notificationsService.getUnreadCount(user.id, appType);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read', type: NotificationDto })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.deleteNotification(id, user.id);
  }
}

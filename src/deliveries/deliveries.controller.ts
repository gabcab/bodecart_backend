import { Controller, Get, Post, Body, Patch, Param, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { AssignDeliveryDto } from './dtos/assign-delivery.dto';
import { UpdateLocationDto } from './dtos/update-location.dto';
import { CompleteDeliveryDto } from './dtos/complete-delivery.dto';
import { DeliveryDto } from './dtos/delivery.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Roles(UserRole.DELIVERY_PERSON)
  @Get('available')
  @ApiOperation({ summary: 'Get available deliveries (Delivery Person only)' })
  @ApiResponse({ status: 200, description: 'List of available deliveries' })
  async getAvailable(@CurrentUser() user: any) {
    return this.deliveriesService.getAvailableDeliveries(user.id);
  }

  @Roles(UserRole.DELIVERY_PERSON)
  @Get('my-deliveries')
  @ApiOperation({ summary: 'Get my deliveries (Delivery Person only)' })
  @ApiResponse({ status: 200, description: 'List of deliveries', type: [DeliveryDto] })
  async getMyDeliveries(@CurrentUser() user: any) {
    return this.deliveriesService.getMyDeliveries(user.id, user.role);
  }

  @Roles(UserRole.DELIVERY_PERSON)
  @Post('assign')
  @ApiOperation({ summary: 'Assign delivery to self (Delivery Person only)' })
  @ApiResponse({
    status: 201,
    description: 'Delivery assigned successfully',
    type: DeliveryDto,
  })
  async assign(@Body() assignDeliveryDto: AssignDeliveryDto, @CurrentUser() user: any) {
    return this.deliveriesService.assignDelivery(assignDeliveryDto, user.id);
  }

  @Roles(UserRole.DELIVERY_PERSON)
  @Patch('my-location')
  @ApiOperation({ summary: 'Update delivery person GPS location' })
  @ApiResponse({ status: 200, description: 'Location updated' })
  async updateMyLocation(
    @Body() updateLocationDto: UpdateLocationDto,
    @CurrentUser() user: any,
  ) {
    return this.deliveriesService.updateMyLocation(user.id, updateLocationDto);
  }

  @Roles(UserRole.DELIVERY_PERSON)
  @Patch(':id/pickup')
  @ApiOperation({ summary: 'Mark delivery as picked up (Delivery Person only)' })
  @ApiResponse({ status: 200, description: 'Delivery marked as picked up', type: DeliveryDto })
  async pickup(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body?: { pickupPhoto?: string },
  ) {
    return this.deliveriesService.pickupDelivery(id, user.id, body?.pickupPhoto);
  }

  @Roles(UserRole.DELIVERY_PERSON)
  @Patch(':id/location')
  @ApiOperation({ summary: 'Update delivery location (Delivery Person only)' })
  @ApiResponse({ status: 200, description: 'Location updated', type: DeliveryDto })
  async updateLocation(
    @Param('id') id: string,
    @Body() updateLocationDto: UpdateLocationDto,
    @CurrentUser() user: any,
  ) {
    return this.deliveriesService.updateLocation(id, updateLocationDto, user.id);
  }

  @Roles(UserRole.DELIVERY_PERSON)
  @Post(':id/proof-photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload delivery proof photo (Delivery Person only)' })
  @ApiResponse({ status: 201, description: 'Photo uploaded successfully' })
  async uploadProofPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const url = await this.deliveriesService.uploadProofPhoto(id, file, user.id);
    return { url };
  }

  @Roles(UserRole.DELIVERY_PERSON)
  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete delivery (Delivery Person only)' })
  @ApiResponse({ status: 200, description: 'Delivery completed', type: DeliveryDto })
  async complete(
    @Param('id') id: string,
    @Body() completeDeliveryDto: CompleteDeliveryDto,
    @CurrentUser() user: any,
  ) {
    return this.deliveriesService.completeDelivery(id, completeDeliveryDto, user.id);
  }

  @Roles(UserRole.DELIVERY_PERSON)
  @Patch('availability')
  @ApiOperation({ summary: 'Update delivery person availability' })
  @ApiResponse({ status: 200, description: 'Availability updated' })
  async updateAvailability(@CurrentUser() user: any, @Body() body: { isAvailable: boolean }) {
    return this.deliveriesService.updateAvailability(user.id, body.isAvailable);
  }

  @Roles(UserRole.CLIENT, UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON, UserRole.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Get delivery by ID' })
  @ApiResponse({ status: 200, description: 'Delivery found', type: DeliveryDto })
  @ApiResponse({ status: 404, description: 'Delivery not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.deliveriesService.findOne(id, user.id, user.role);
  }
}

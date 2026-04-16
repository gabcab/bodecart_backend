import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Body,
  UseGuards,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UpdateClientDto } from './dtos/update-client.dto';
import { UpdateDeliveryPersonDto } from './dtos/update-delivery-person.dto';
import { UpdatePayoutMethodsDto } from './dtos/update-payout-methods.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { UploadService } from '../common/upload/upload.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadService: UploadService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'User profile updated successfully' })
  async updateProfile(@CurrentUser() user: any, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.updateProfile(user.id, updateUserDto);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Avatar uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Get current user and delete old avatar BEFORE uploading new one
    const currentUser = await this.usersService.getUserById(user.id);
    if (currentUser.avatar) {
      try {
        await this.uploadService.deleteFile(currentUser.avatar);
      } catch (error) {
        // Ignore errors when deleting old avatar
      }
    }

    // Upload the new avatar with timestamp to avoid conflicts
    const avatarUrl = await this.uploadService.uploadFile(
      file,
      'avatars',
      `user-${user.id}-${Date.now()}`,
    );

    // Update user avatar in database
    const updatedUser = await this.usersService.updateProfile(user.id, {
      avatar: avatarUrl,
    });

    return {
      message: 'Avatar uploaded successfully',
      avatarUrl: updatedUser.avatar,
    };
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Delete current user avatar' })
  @ApiResponse({ status: 200, description: 'Avatar deleted successfully' })
  async deleteAvatar(@CurrentUser() user: any) {
    const updatedUser = await this.usersService.clearAvatar(user.id);
    return {
      message: 'Avatar deleted successfully',
      user: updatedUser,
    };
  }

  @Post('me/vehicle-photos')
  @Roles(UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Upload vehicle photos' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Vehicle photos uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid files' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'vehiclePhoto', maxCount: 1 },
      { name: 'vehiclePlatePhoto', maxCount: 1 },
    ]),
  )
  async uploadVehiclePhotos(
    @CurrentUser() user: any,
    @UploadedFiles()
    files: {
      vehiclePhoto?: Express.Multer.File[];
      vehiclePlatePhoto?: Express.Multer.File[];
    },
  ) {
    if (!files || (!files.vehiclePhoto && !files.vehiclePlatePhoto)) {
      throw new BadRequestException('No files provided');
    }

    const result: { vehiclePhoto?: string; vehiclePlatePhoto?: string } = {};

    // Upload vehicle photo if provided
    if (files.vehiclePhoto && files.vehiclePhoto[0]) {
      const vehiclePhotoUrl = await this.uploadService.uploadFile(
        files.vehiclePhoto[0],
        'vehicles',
        `vehicle-${user.id}`,
      );
      result.vehiclePhoto = vehiclePhotoUrl;
    }

    // Upload vehicle plate photo if provided
    if (files.vehiclePlatePhoto && files.vehiclePlatePhoto[0]) {
      const vehiclePlatePhotoUrl = await this.uploadService.uploadFile(
        files.vehiclePlatePhoto[0],
        'vehicles',
        `plate-${user.id}`,
      );
      result.vehiclePlatePhoto = vehiclePlatePhotoUrl;
    }

    return {
      message: 'Vehicle photos uploaded successfully',
      ...result,
    };
  }

  @Put('me/client')
  @Roles(UserRole.CLIENT)
  @ApiOperation({ summary: 'Update client-specific profile' })
  @ApiResponse({ status: 200, description: 'Client profile updated successfully' })
  async updateClientProfile(@CurrentUser() user: any, @Body() updateClientDto: UpdateClientDto) {
    return this.usersService.updateClientProfile(user.id, updateClientDto);
  }

  @Put('me/delivery-person')
  @Roles(UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Update delivery person profile' })
  @ApiResponse({ status: 200, description: 'Delivery person profile updated successfully' })
  async updateDeliveryPersonProfile(
    @CurrentUser() user: any,
    @Body() updateDeliveryPersonDto: UpdateDeliveryPersonDto,
  ) {
    return this.usersService.updateDeliveryPersonProfile(user.id, updateDeliveryPersonDto);
  }

  // ============================================
  // PAYOUT METHODS ENDPOINTS (BODEGA OWNER & DELIVERY PERSON)
  // ============================================

  @Get('me/payout-methods')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Get payout methods for bodega owner or delivery person' })
  @ApiResponse({ status: 200, description: 'Payout methods retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Only bodega owners and delivery persons can access payout methods' })
  async getPayoutMethods(@CurrentUser() user: any) {
    return this.usersService.getPayoutMethods(user.id);
  }

  @Put('me/payout-methods')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Update payout methods for bodega owner or delivery person' })
  @ApiResponse({ status: 200, description: 'Payout methods updated successfully' })
  @ApiResponse({ status: 403, description: 'Only bodega owners and delivery persons can update payout methods' })
  async updatePayoutMethods(
    @CurrentUser() user: any,
    @Body() updatePayoutMethodsDto: UpdatePayoutMethodsDto,
  ) {
    return this.usersService.updatePayoutMethods(user.id, updatePayoutMethodsDto);
  }

  // ============================================
  // DOCUMENT UPLOAD ENDPOINTS
  // ============================================

  @Post('me/documents/upload')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Upload document for verification' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Document uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or document type' })
  @UseInterceptors(FileInterceptor('document'))
  async uploadDocument(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { documentType: string; bodegaId?: string },
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!body.documentType) {
      throw new BadRequestException('Document type is required');
    }

    // Validate file type (PDF, JPG, PNG only)
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF, JPG, and PNG files are allowed');
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 10MB');
    }

    return this.usersService.uploadDocument(user.id, file, body.documentType, body.bodegaId);
  }

  @Get('me/documents')
  @Roles(UserRole.BODEGA_OWNER, UserRole.DELIVERY_PERSON)
  @ApiOperation({ summary: 'Get my documents' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async getMyDocuments(@CurrentUser() user: any) {
    return this.usersService.getMyDocuments(user.id);
  }

  @Get('delivery-persons/available')
  @Roles(UserRole.ADMIN, UserRole.BODEGA_OWNER)
  @ApiOperation({ summary: 'Get available delivery persons' })
  @ApiResponse({ status: 200, description: 'Available delivery persons retrieved successfully' })
  async getAvailableDeliveryPersons() {
    return this.usersService.getAvailableDeliveryPersons();
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users with filters (Admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async getAllUsers(
    @Query('role') role?: UserRole,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.getAllUsers({
      role,
      status: status as any,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user status (Admin only)' })
  @ApiResponse({ status: 200, description: 'User status updated successfully' })
  async updateUserStatus(@Param('id') userId: string, @Body() body: { status: string }) {
    return this.usersService.updateUserStatus(userId, body.status as any);
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add role to user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User role added successfully' })
  async updateUserRole(@Param('id') userId: string, @Body() body: { role: UserRole }) {
    return this.usersService.updateUserRole(userId, body.role);
  }

  @Delete(':id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove role from user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User role removed successfully' })
  @ApiResponse({ status: 400, description: 'Cannot remove last role' })
  async removeUserRole(@Param('id') userId: string, @Body() body: { role: UserRole }) {
    return this.usersService.removeUserRole(userId, body.role);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async deleteUser(@Param('id') userId: string) {
    return this.usersService.deleteUser(userId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }
}

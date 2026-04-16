import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { BodegasService } from './bodegas.service';
import { CreateBodegaDto } from './dtos/create-bodega.dto';
import { UpdateBodegaDto } from './dtos/update-bodega.dto';
import { SearchBodegasDto } from './dtos/search-bodegas.dto';
import { UploadDocumentDto } from './dtos/upload-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { UploadService } from '../common/upload/upload.service';

@ApiTags('Bodegas')
@Controller('bodegas')
export class BodegasController {
  constructor(
    private readonly bodegasService: BodegasService,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new bodega' })
  @ApiResponse({ status: 201, description: 'Bodega created successfully' })
  async create(@CurrentUser() user: any, @Body() createBodegaDto: CreateBodegaDto) {
    return this.bodegasService.create(user.id, createBodegaDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bodegas' })
  @ApiResponse({ status: 200, description: 'Bodegas retrieved successfully' })
  async findAll(@Query('ownerId') ownerId?: string) {
    return this.bodegasService.findAll(ownerId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search bodegas by location and name' })
  @ApiResponse({ status: 200, description: 'Bodegas search results' })
  async search(@Query() searchDto: SearchBodegasDto) {
    return this.bodegasService.searchNearby(searchDto);
  }

  @Get('fastest')
  @ApiOperation({ summary: 'Get bodegas sorted by estimated delivery time (ETA)' })
  @ApiResponse({ status: 200, description: 'Bodegas sorted by fastest ETA' })
  async getFastest(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('radius') radius?: string,
  ) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = radius ? parseFloat(radius) : 10;

    if (isNaN(lat) || isNaN(lng)) {
      return this.bodegasService.findAll();
    }

    return this.bodegasService.searchByETA(lat, lng, radiusKm);
  }

  @Get('by-category/:categoryId')
  @ApiOperation({ summary: 'Get bodegas with products in a specific category, sorted by distance' })
  @ApiResponse({ status: 200, description: 'Bodegas with products in category retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getBodegasByCategory(
    @Param('categoryId') categoryId: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
  ) {
    const lat = latitude ? parseFloat(latitude) : undefined;
    const lng = longitude ? parseFloat(longitude) : undefined;

    return this.bodegasService.getBodegasByCategory(categoryId, lat, lng);
  }

  @Get('my-bodegas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user bodegas' })
  @ApiResponse({ status: 200, description: 'User bodegas retrieved successfully' })
  async findMyBodegas(@CurrentUser() user: any) {
    return this.bodegasService.findByOwner(user.id);
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user favorite bodegas' })
  @ApiResponse({ status: 200, description: 'Favorite bodegas retrieved successfully' })
  async getFavorites(@CurrentUser() user: any) {
    return this.bodegasService.getFavorites(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bodega by ID' })
  @ApiResponse({ status: 200, description: 'Bodega retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Bodega not found' })
  async findOne(@Param('id') id: string) {
    return this.bodegasService.findOne(id);
  }

  @Post(':id/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle bodega as favorite' })
  @ApiResponse({ status: 200, description: 'Favorite status toggled successfully' })
  async toggleFavorite(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bodegasService.toggleFavorite(id, user.id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update bodega' })
  @ApiResponse({ status: 200, description: 'Bodega updated successfully' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateBodegaDto: UpdateBodegaDto,
  ) {
    return this.bodegasService.update(id, user.id, updateBodegaDto);
  }

  @Post(':id/logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload bodega logo' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Logo uploaded successfully' })
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type (only images)
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only images (JPEG, PNG, WebP) are allowed');
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size too large. Maximum size is 5MB');
    }

    // Upload logo file
    const logoUrl = await this.uploadService.uploadFile(
      file,
      'logos',
      `bodega-${id}-logo-${Date.now()}`,
      allowedMimes,
    );

    // Update bodega with logo URL
    const bodega = await this.bodegasService.uploadLogo(id, user.id, logoUrl);

    return { message: 'Logo uploaded successfully', logoUrl, bodega };
  }

  @Put(':id/extend-hours')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Extend bodega hours by 1 hour (manual override)' })
  @ApiResponse({ status: 200, description: 'Bodega hours extended successfully' })
  @ApiResponse({ status: 403, description: 'Not the owner of this bodega' })
  @ApiResponse({ status: 404, description: 'Bodega not found' })
  async extendHours(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bodegasService.extendHours(id, user.id);
  }

  @Put(':id/set-primary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set bodega as primary' })
  @ApiResponse({ status: 200, description: 'Bodega set as primary successfully' })
  async setPrimary(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bodegasService.setPrimary(id, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete bodega' })
  @ApiResponse({ status: 200, description: 'Bodega deleted successfully' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bodegasService.remove(id, user.id);
  }

  // ============================================
  // DOCUMENT ENDPOINTS
  // ============================================

  @Post(':id/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload bodega document' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  @UseInterceptors(FileInterceptor('document'))
  async uploadDocument(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() uploadDocumentDto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type (PDF, images, etc.)
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only PDF and images are allowed');
    }

    // Upload document file with allowed MIME types
    const fileUrl = await this.uploadService.uploadFile(
      file,
      'documents',
      `bodega-${id}-${uploadDocumentDto.type}-${Date.now()}`,
      allowedMimes,
    );

    // Create document record in database
    const document = await this.bodegasService.uploadDocument(
      id,
      user.id,
      uploadDocumentDto,
      fileUrl,
      file.originalname,
      file.size,
      file.mimetype,
    );

    return { message: 'Document uploaded successfully', document };
  }

  @Get(':id/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all documents for a bodega' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async getDocuments(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bodegasService.getDocuments(id, user.id);
  }

  @Get(':id/documents/required')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get required documents for a bodega' })
  @ApiResponse({ status: 200, description: 'Required documents list retrieved successfully' })
  async getRequiredDocuments(@Param('id') id: string) {
    return this.bodegasService.getRequiredDocuments(id);
  }

  @Get(':id/verification-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get verification status for a bodega' })
  @ApiResponse({ status: 200, description: 'Verification status retrieved successfully' })
  async checkVerificationStatus(@Param('id') id: string) {
    return this.bodegasService.checkVerificationStatus(id);
  }

  @Delete('documents/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a document' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  async deleteDocument(@Param('documentId') documentId: string, @CurrentUser() user: any) {
    return this.bodegasService.deleteDocument(documentId, user.id);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Patch(':id/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify or unverify a bodega (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bodega verification status updated successfully' })
  async verifyBodega(
    @Param('id') id: string,
    @Body() body: { isVerified: boolean; reason?: string },
  ) {
    return this.bodegasService.verifyBodega(id, body.isVerified, body.reason);
  }

  @Patch(':id/suspend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend a bodega (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bodega suspended successfully' })
  async suspendBodega(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.bodegasService.suspendBodega(id, body.reason);
  }

  @Patch(':id/timezone')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update bodega timezone (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bodega timezone updated successfully' })
  async updateTimezone(
    @Param('id') id: string,
    @Body() body: { timezone: string },
  ) {
    return this.bodegasService.updateTimezone(id, body.timezone);
  }

  @Patch(':bodegaId/documents/:documentId/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify or reject a document (Admin only)' })
  @ApiResponse({ status: 200, description: 'Document verification status updated successfully' })
  async verifyDocument(
    @Param('bodegaId') bodegaId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Body() body: { status: string; rejectionReason?: string },
  ) {
    return this.bodegasService.verifyDocument(
      bodegaId,
      documentId,
      user.id,
      body.status as any,
      body.rejectionReason,
    );
  }
}

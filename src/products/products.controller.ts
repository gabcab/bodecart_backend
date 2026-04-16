import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { BulkUploadProductDto } from './dtos/bulk-upload-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { UploadService } from '../common/upload/upload.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new product in multiple bodegas',
    description:
      'Creates independent copies of a product in the specified bodegas. Each product will have its own stock, price, and availability.',
  })
  @ApiResponse({
    status: 201,
    description: 'Products created successfully in all selected bodegas',
    schema: {
      example: {
        data: [
          {
            id: 'product-id-1',
            bodegaId: 'bodega-id-1',
            name: 'Coca Cola 2L',
            price: 2.5,
            stock: 100,
            bodega: {
              id: 'bodega-id-1',
              name: 'Mi Bodega 1',
              street: 'Calle Principal',
              city: 'Guayaquil',
            },
          },
          {
            id: 'product-id-2',
            bodegaId: 'bodega-id-2',
            name: 'Coca Cola 2L',
            price: 2.5,
            stock: 100,
            bodega: {
              id: 'bodega-id-2',
              name: 'Mi Bodega 2',
              street: 'Av. Secundaria',
              city: 'Guayaquil',
            },
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid data or empty bodega array' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not own one or more of the specified bodegas',
  })
  @ApiResponse({ status: 404, description: 'Not found - One or more bodegas do not exist' })
  async create(@CurrentUser() user: any, @Body() createProductDto: CreateProductDto) {
    return this.productsService.create(user.id, createProductDto);
  }

  @Post('upload-images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('images', 5))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload product images (generic)' })
  @ApiResponse({ status: 200, description: 'Images uploaded successfully' })
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    const imageUrls = await this.uploadService.uploadFiles(files, 'products');
    return { data: imageUrls };
  }

  @Post('bulk-upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Bulk upload products from CSV file',
    description: 'Upload a CSV file to create multiple products at once. The CSV must contain columns: nombre, categoria, precio, stock. Optional columns: descripcion, subcategoria, precio_descuento, disponible.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV file with product data',
        },
        bodegaIds: {
          type: 'string',
          description: 'Comma-separated list of bodega IDs',
          example: 'bodega-id-1,bodega-id-2',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Products uploaded successfully',
    schema: {
      example: {
        success: true,
        totalRows: 10,
        successCount: 8,
        errorCount: 2,
        errors: [
          { row: 3, name: 'Producto X', error: 'Categoría no encontrada' },
        ],
        createdProducts: [
          { name: 'Producto 1', bodegaCount: 2 },
        ],
      },
    },
  })
  async bulkUpload(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('bodegaIds') bodegaIdsStr: string,
  ) {
    const bodegaIds = bodegaIdsStr.split(',').map((id) => id.trim()).filter((id) => id);
    return this.productsService.bulkUpload(user.id, bodegaIds, file.buffer, file.originalname);
  }

  @Get('bulk-upload/template')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download CSV template for bulk product upload' })
  @ApiResponse({ status: 200, description: 'CSV template file' })
  async downloadTemplate(@Res() res: Response) {
    const csvContent = `nombre,descripcion,categoria,subcategoria,precio,precio_descuento,stock,disponible,imagenes
Arroz Premium 1kg,Arroz de primera calidad grano largo,Abarrotes,Granos,2.50,,100,si,https://ejemplo.com/arroz1.jpg|https://ejemplo.com/arroz2.jpg
Aceite Vegetal 1L,Aceite de cocina multiusos,Abarrotes,Aceites,3.75,,50,si,https://ejemplo.com/aceite.jpg
Leche Entera 1L,Leche fresca pasteurizada,Lácteos,,1.25,,80,si,
Pan de Molde,Pan blanco rebanado 500g,Panadería,,2.00,1.80,30,si,https://ejemplo.com/pan.jpg
Coca Cola 2L,Refresco cola familiar,Bebidas,Gaseosas,2.50,,60,si,https://ejemplo.com/coca1.jpg|https://ejemplo.com/coca2.jpg|https://ejemplo.com/coca3.jpg`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla_productos.csv');
    res.send('\uFEFF' + csvContent); // BOM for Excel UTF-8 compatibility
  }

  @Get('categories/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of available categories for products' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  async getCategories() {
    return this.productsService.getCategories();
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('images', 5))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and attach images to a specific product' })
  @ApiResponse({ status: 200, description: 'Images uploaded and attached to product' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async uploadProductImages(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const imageUrls = await this.uploadService.uploadFiles(files, 'products');
    return this.productsService.addImages(id, user.id, imageUrls);
  }

  @Delete(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a specific image from a product' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description: 'URL of the image to remove',
          example: 'https://example.com/image.jpg',
        },
      },
      required: ['imageUrl'],
    },
  })
  @ApiResponse({ status: 200, description: 'Image removed successfully' })
  @ApiResponse({ status: 404, description: 'Product or image not found' })
  async removeProductImage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('imageUrl') imageUrl: string,
  ) {
    return this.productsService.removeImage(id, user.id, imageUrl);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async findAll(@Query('locale') locale?: string) {
    return this.productsService.findAll(locale);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search products' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(@Query('q') query: string) {
    return this.productsService.searchProducts(query);
  }

  @Get('bodega/:bodegaId')
  @ApiOperation({ summary: 'Get products by bodega' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async findByBodega(@Param('bodegaId') bodegaId: string, @Query('locale') locale?: string) {
    return this.productsService.findByBodega(bodegaId, locale);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.productsService.findOne(id, locale);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user.id, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BODEGA_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productsService.remove(id, user.id);
  }
}

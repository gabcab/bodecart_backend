import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BundleItemDto {
  @ApiProperty({ example: 'product-uuid-123' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Arroz Blanco 1kg' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Arroz de primera calidad', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'category-uuid-123', description: 'Category ID' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: 'Granos', required: false })
  @IsString()
  @IsOptional()
  subcategory?: string;

  @ApiProperty({ example: 1.5 })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  price: number;

  @ApiProperty({ example: 1.25, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPrice?: number;

  @ApiProperty({
    example: 150.0,
    required: false,
    description: 'Price in the bodega local currency (will be converted to USD for storage)',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  originalPrice?: number;

  @ApiProperty({
    example: 'DOP',
    required: false,
    description: 'Currency code for the original price (e.g., DOP, EUR, MXN)',
  })
  @IsString()
  @IsOptional()
  originalCurrency?: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  stock: number;

  @ApiProperty({
    example: ['bodega-id-1', 'bodega-id-2', 'bodega-id-3'],
    description: 'Array of bodega IDs where the product will be created',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one bodega must be selected' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  bodegaIds: string[];

  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsOptional()
  images?: string[];

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiProperty({ example: '7501000121313', required: false, description: 'Product barcode (EAN-13, UPC, etc.)' })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  isBundle?: boolean;

  @ApiProperty({ type: [BundleItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BundleItemDto)
  @IsOptional()
  bundleItems?: BundleItemDto[];
}

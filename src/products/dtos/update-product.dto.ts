import { IsOptional, IsString, IsNumber, IsBoolean, IsArray, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BundleItemDto } from './create-product.dto';

export class UpdateProductDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'category-uuid-123', description: 'Category ID', required: false })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  subcategory?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsOptional()
  images?: string[];

  @ApiProperty({ required: false })
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

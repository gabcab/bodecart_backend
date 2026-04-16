import { IsNotEmpty, IsString, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkUploadProductDto {
  @ApiProperty({
    example: ['bodega-id-1', 'bodega-id-2'],
    description: 'Array of bodega IDs where products will be created',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one bodega must be selected' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  bodegaIds: string[];
}

export interface BulkProductRow {
  name: string;
  description?: string;
  categoryName: string;
  subcategory?: string;
  price: number;
  discountPrice?: number;
  stock: number;
  isAvailable?: boolean;
  images?: string[]; // Array of image URLs
}

export interface BulkUploadResult {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: {
    row: number;
    name: string;
    error: string;
  }[];
  createdProducts: {
    name: string;
    bodegaCount: number;
  }[];
}

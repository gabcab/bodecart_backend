import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bodegaId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  category: string;

  @ApiProperty({ required: false })
  subcategory?: string;

  @ApiProperty()
  price: number;

  @ApiProperty({ required: false })
  discountPrice?: number;

  @ApiProperty()
  stock: number;

  @ApiProperty()
  isAvailable: boolean;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ required: false })
  unit?: string;

  @ApiProperty({ required: false })
  weight?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

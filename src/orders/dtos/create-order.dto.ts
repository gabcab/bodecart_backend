import {
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @ApiProperty({ example: 'product-id-123' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 1.5, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'bodega-id-123' })
  @IsString()
  @IsNotEmpty()
  bodegaId: string;

  @ApiProperty({ example: 'address-id-123' })
  @IsString()
  @IsNotEmpty()
  addressId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: 'Ring the doorbell twice', required: false })
  @IsString()
  @IsOptional()
  specialInstructions?: string;

  @ApiProperty({ example: 0, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;
}

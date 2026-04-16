import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty()
  @IsString()
  orderId: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ required: false, description: 'Stripe payment method ID for card payments' })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiProperty({ required: false, description: 'PayPal order ID for PayPal payments' })
  @IsOptional()
  @IsString()
  paypalOrderId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: any;
}

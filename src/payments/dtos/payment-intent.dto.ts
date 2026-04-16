import { IsNumber, IsString, IsOptional, IsEnum } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentIntentDto {
  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'usd';

  @IsString()
  @IsOptional()
  orderId?: string;

  @IsString()
  @IsOptional()
  customerId?: string;
}

export class CreatePayPalOrderDto {
  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @IsString()
  orderId: string;

  @IsString()
  returnUrl: string;

  @IsString()
  cancelUrl: string;
}

export class CapturePayPalOrderDto {
  @IsString()
  paypalOrderId: string;

  @IsString()
  orderId: string;
}

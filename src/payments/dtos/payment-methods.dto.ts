import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class PaymentMethodResponseDto {
  @ApiProperty({ description: 'Payment method ID from Stripe' })
  id: string;

  @ApiProperty({ description: 'Card brand (visa, mastercard, amex, etc.)' })
  brand: string;

  @ApiProperty({ description: 'Last 4 digits of the card' })
  last4: string;

  @ApiProperty({ description: 'Card expiration month (1-12)' })
  expMonth: number;

  @ApiProperty({ description: 'Card expiration year' })
  expYear: number;

  @ApiProperty({ description: 'Whether this is the default payment method' })
  isDefault: boolean;
}

export class SavePaymentMethodDto {
  @ApiProperty({ description: 'Stripe payment method ID to attach to customer' })
  @IsString()
  paymentMethodId: string;

  @ApiPropertyOptional({ description: 'Set this payment method as default' })
  @IsBoolean()
  @IsOptional()
  setAsDefault?: boolean;
}

export class SetupIntentResponseDto {
  @ApiProperty({ description: 'Client secret for Stripe SetupIntent' })
  clientSecret: string;

  @ApiProperty({ description: 'SetupIntent ID' })
  setupIntentId: string;
}

export class DeletePaymentMethodDto {
  @ApiProperty({ description: 'Stripe payment method ID to remove' })
  @IsString()
  paymentMethodId: string;
}

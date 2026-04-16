import { IsOptional, IsString, IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePayoutMethodsDto {
  @ApiProperty({
    required: false,
    description: 'PayPal email address for receiving payments',
    example: 'bodeguero@paypal.com',
  })
  @IsEmail()
  @IsOptional()
  paypalEmail?: string;

  @ApiProperty({
    required: false,
    description: 'Stripe Connect account ID for receiving payments',
    example: 'acct_1234567890',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  stripeAccountId?: string;

  @ApiProperty({
    required: false,
    description: 'Bank account information (encrypted or masked)',
    example: '****1234',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  bankAccount?: string;
}

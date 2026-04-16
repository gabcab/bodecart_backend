import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Supported country ISO codes for Stripe Connect payouts.
 */
const SUPPORTED_COUNTRIES = [
  'US', 'CA', 'MX', 'PR', 'DO',
  'ES', 'GB', 'FR', 'DE',
  'BR', 'CO', 'CL', 'PE', 'AR',
] as const;

export class CreateConnectedAccountDto {
  @ApiPropertyOptional({ description: 'Business name (for bodegueros)' })
  @IsString()
  @IsOptional()
  businessName?: string;

  @ApiPropertyOptional({
    description: 'Country ISO 3166-1 alpha-2 code (default: US)',
    enum: SUPPORTED_COUNTRIES,
  })
  @IsString()
  @IsOptional()
  @IsIn(SUPPORTED_COUNTRIES)
  country?: string;
}

export class CreateAccountLinkDto {
  @ApiProperty({ description: 'URL to redirect if onboarding needs to be refreshed' })
  @IsString()
  refreshUrl: string;

  @ApiProperty({ description: 'URL to redirect after successful onboarding' })
  @IsString()
  returnUrl: string;
}

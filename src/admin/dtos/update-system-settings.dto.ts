import { IsOptional, IsNumber, IsBoolean, IsArray, IsString, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional({
    description: 'Tax rate percentage',
    example: 8.5,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  @ApiPropertyOptional({
    description: 'Base delivery fee in dollars',
    example: 2.99,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseDeliveryFee?: number;

  @ApiPropertyOptional({
    description: 'Per kilometer delivery fee in dollars',
    example: 0.5,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  perKmDeliveryFee?: number;

  @ApiPropertyOptional({
    description: 'Platform commission percentage',
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformCommission?: number;

  @ApiPropertyOptional({
    description: 'Enabled payment methods',
    example: ['CARD', 'PAYPAL', 'CASH'],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledPaymentMethods?: string[];

  @ApiPropertyOptional({
    description: 'Maintenance mode status',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;
}

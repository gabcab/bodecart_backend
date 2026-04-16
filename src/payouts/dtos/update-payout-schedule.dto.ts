import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePayoutScheduleDto {
  @ApiPropertyOptional({
    description: 'Enable or disable automatic scheduled payouts globally',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  payoutEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'How often to run automatic payouts',
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'manual'],
    example: 'weekly',
  })
  @IsIn(['daily', 'weekly', 'biweekly', 'monthly', 'manual'])
  @IsOptional()
  payoutFrequency?: string;

  @ApiPropertyOptional({
    description:
      'Day of the week to process payouts for weekly/biweekly schedules (0=Sunday, 1=Monday … 6=Saturday)',
    minimum: 0,
    maximum: 6,
    example: 1,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  payoutDayOfWeek?: number;

  @ApiPropertyOptional({
    description: 'Minimum pending earning amount (USD) required to trigger an automatic payout',
    minimum: 0.01,
    example: 10.0,
  })
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  payoutMinimumAmount?: number;
}

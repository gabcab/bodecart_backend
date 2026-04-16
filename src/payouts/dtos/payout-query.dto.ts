import { IsOptional, IsIn, IsNumber, Min, IsUUID, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class PayoutQueryDto {
  @ApiPropertyOptional({ description: 'Filter by user type' })
  @IsIn(['bodeguero', 'repartidor'])
  @IsOptional()
  userType?: 'bodeguero' | 'repartidor';

  @ApiPropertyOptional({ description: 'Filter by payout status' })
  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: 'Start date filter' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page' })
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number = 20;
}

export class EarningsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by earning status' })
  @IsIn(['PENDING', 'PROCESSING', 'PAID', 'CANCELLED'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by earning type' })
  @IsIn(['ORDER_SALE', 'DELIVERY_FEE', 'TIP'])
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Start date filter' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page' })
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number = 20;
}

import { IsString, IsNumber, IsOptional, IsUUID, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePayoutDto {
  @ApiProperty({ description: 'User ID (bodega owner or delivery person)' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'User type' })
  @IsIn(['bodeguero', 'repartidor'])
  userType: 'bodeguero' | 'repartidor';

  @ApiPropertyOptional({ description: 'Amount to payout (if not provided, all pending earnings will be paid)' })
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amount?: number;
}

export class CreateBulkPayoutDto {
  @ApiProperty({ description: 'User type to process payouts for' })
  @IsIn(['bodeguero', 'repartidor', 'all'])
  userType: 'bodeguero' | 'repartidor' | 'all';

  @ApiPropertyOptional({ description: 'Minimum amount to trigger payout (default: $10)' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  minimumAmount?: number;
}

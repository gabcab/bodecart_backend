import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyBodegaDto {
  @ApiProperty({
    description: 'Whether to verify or unverify the bodega',
    example: true,
  })
  @IsBoolean()
  isVerified: boolean;

  @ApiPropertyOptional({
    description: 'Reason for verification or rejection',
    example: 'All documents approved',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

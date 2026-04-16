import { IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum UserTypeFilter {
  BODEGA_OWNER = 'BODEGA_OWNER',
  DELIVERY_PERSON = 'DELIVERY_PERSON',
  ALL = 'ALL',
}

export enum DocumentStatusFilter {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ALL = 'ALL',
}

export class VerificationQueueQueryDto {
  @ApiPropertyOptional({ enum: UserTypeFilter, default: UserTypeFilter.ALL })
  @IsOptional()
  @IsEnum(UserTypeFilter)
  userType?: UserTypeFilter = UserTypeFilter.ALL;

  @ApiPropertyOptional({ enum: DocumentStatusFilter, default: DocumentStatusFilter.PENDING })
  @IsOptional()
  @IsEnum(DocumentStatusFilter)
  status?: DocumentStatusFilter = DocumentStatusFilter.PENDING;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

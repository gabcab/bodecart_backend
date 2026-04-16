import { IsOptional, IsString, IsNumber, IsBoolean, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBodegaDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  street?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  zipCode?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  logo?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isOpen?: boolean;

  @ApiProperty({ example: '08:00', required: false })
  @IsString()
  @IsOptional()
  openingTime?: string;

  @ApiProperty({ example: '22:00', required: false })
  @IsString()
  @IsOptional()
  closingTime?: string;

  @ApiProperty({ example: 'America/Santo_Domingo', required: false })
  @IsString()
  @IsOptional()
  timezone?: string;
}

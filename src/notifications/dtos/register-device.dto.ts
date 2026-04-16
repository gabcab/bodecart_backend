import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDeviceDto {
  @ApiProperty({ example: 'fcm_token_...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'android', description: 'android | ios | web' })
  @IsString()
  @IsNotEmpty()
  platform: string;

  @ApiProperty({ example: 'CLIENT', description: 'CLIENT | BODEGA_OWNER | DELIVERY_PERSON', required: false })
  @IsString()
  @IsOptional()
  appType?: string;

  @ApiProperty({ example: 'es', description: 'User locale: es | en', required: false })
  @IsString()
  @IsOptional()
  locale?: string;
}

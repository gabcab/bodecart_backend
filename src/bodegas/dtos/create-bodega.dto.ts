import { IsNotEmpty, IsString, IsNumber, IsOptional, IsBoolean, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBodegaDto {
  @ApiProperty({ example: 'Bodega Central' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Productos variados', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'Calle 50' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: 'Ciudad de Panamá' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Panamá' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '00000' })
  @IsString()
  @IsNotEmpty()
  zipCode: string;

  @ApiProperty({ example: 'Panamá', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ example: 9.0333 })
  @IsNumber()
  @IsNotEmpty()
  latitude: number;

  @ApiProperty({ example: -79.5333 })
  @IsNumber()
  @IsNotEmpty()
  longitude: number;

  @ApiProperty({ example: '+507 6000-0000' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  logo?: string;

  @ApiProperty({ example: true, required: false })
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

import { IsNotEmpty, IsString, IsNumber, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiProperty({ example: 'Casa', description: 'Label for the address (e.g., Home, Work, etc.)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label: string;

  @ApiProperty({ example: 'Calle 50, Edificio XYZ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  street: string;

  @ApiProperty({ example: 'Apto 5A', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  apartment?: string;

  @ApiProperty({ example: 'Ciudad de Panamá' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'Panamá' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state: string;

  @ApiProperty({ example: '00000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  zipCode: string;

  @ApiProperty({ example: 'Panamá', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @ApiProperty({ example: 9.0333, required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ example: -79.5333, required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ example: 'Tocar el timbre del apartamento 5A', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  instructions?: string;

  @ApiProperty({ example: false, required: false, description: 'Set as default address' })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

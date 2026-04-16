import { IsOptional, IsString, IsBoolean, IsEnum, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum VehicleType {
  MOTORCYCLE = 'MOTORCYCLE',
  BICYCLE = 'BICYCLE',
  CAR = 'CAR',
  SCOOTER = 'SCOOTER',
}

export class UpdateDeliveryPersonDto {
  @ApiProperty({ enum: VehicleType, required: false })
  @IsEnum(VehicleType)
  @IsOptional()
  vehicleType?: VehicleType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  vehiclePlate?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  vehicleColor?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  vehiclePhoto?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  vehiclePlatePhoto?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  currentLat?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  currentLng?: number;
}

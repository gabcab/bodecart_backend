import { ApiProperty } from '@nestjs/swagger';
import { DeliveryStatus } from '@prisma/client';

export class DeliveryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  deliveryPersonId: string;

  @ApiProperty({ enum: DeliveryStatus })
  status: DeliveryStatus;

  @ApiProperty()
  pickupLat: number;

  @ApiProperty()
  pickupLng: number;

  @ApiProperty()
  dropoffLat: number;

  @ApiProperty()
  dropoffLng: number;

  @ApiProperty({ required: false })
  currentLat?: number;

  @ApiProperty({ required: false })
  currentLng?: number;

  @ApiProperty({ required: false })
  estimatedDistance?: number;

  @ApiProperty({ required: false })
  actualDistance?: number;

  @ApiProperty({ required: false })
  estimatedTime?: number;

  @ApiProperty()
  fee: number;

  @ApiProperty()
  tip: number;

  @ApiProperty({ required: false })
  signature?: string;

  @ApiProperty({ required: false })
  photo?: string;

  @ApiProperty({ required: false })
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ required: false })
  assignedAt?: Date;

  @ApiProperty({ required: false })
  pickedUpAt?: Date;

  @ApiProperty({ required: false })
  deliveredAt?: Date;
}

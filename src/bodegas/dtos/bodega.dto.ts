import { ApiProperty } from '@nestjs/swagger';

export class BodegaDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ required: false })
  email?: string;

  @ApiProperty()
  street: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  state: string;

  @ApiProperty()
  zipCode: string;

  @ApiProperty()
  country: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ required: false })
  openingTime?: string;

  @ApiProperty({ required: false })
  closingTime?: string;

  @ApiProperty()
  isOpen: boolean;

  @ApiProperty({ required: false })
  logo?: string;

  @ApiProperty({ required: false })
  banner?: string;

  @ApiProperty({ type: [String] })
  photos: string[];

  @ApiProperty()
  rating: number;

  @ApiProperty()
  totalReviews: number;

  @ApiProperty()
  totalOrders: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  distance?: number; // Distance in km (when searching nearby)
}

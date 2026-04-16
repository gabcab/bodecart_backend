import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty()
  type: string;

  @ApiProperty({ required: false, description: 'Target app type: CLIENT | BODEGA_OWNER | DELIVERY_PERSON' })
  targetAppType?: string;

  @ApiProperty({ required: false })
  data?: any;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty({ required: false })
  readAt?: Date;

  @ApiProperty()
  createdAt: Date;
}

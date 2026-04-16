import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendBodegaDto {
  @ApiProperty({
    description: 'Reason for suspending the bodega',
    example: 'Multiple customer complaints',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

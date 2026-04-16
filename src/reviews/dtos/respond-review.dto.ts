import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RespondReviewDto {
  @ApiProperty({ description: 'Bodega owner response to the review' })
  @IsString()
  @IsNotEmpty()
  response: string;
}

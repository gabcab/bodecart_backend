import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectDocumentDto {
  @ApiProperty({
    description: 'Reason for rejecting the document',
    example: 'Document is expired or illegible',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(10, { message: 'Rejection reason must be at least 10 characters long' })
  reason: string;
}

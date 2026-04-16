import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({
    enum: DocumentType,
    description: 'Type of document being uploaded',
  })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiProperty({
    required: false,
    description: 'Expiration date for documents that expire (format: YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

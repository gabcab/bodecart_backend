import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { join, extname } from 'path';
import { existsSync } from 'fs';

@Controller('uploads')
export class UploadsController {
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  @Get(':folder/:filename')
  serveFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    // Sanitize: prevent directory traversal
    if (
      folder.includes('..') ||
      filename.includes('..') ||
      folder.includes('/') ||
      folder.includes('\\')
    ) {
      throw new BadRequestException('Invalid path');
    }

    const filePath = join(this.uploadsDir, folder, filename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    const ext = extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.sendFile(filePath);
  }
}

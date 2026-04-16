import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3: AWS.S3;
  private bucket: string;
  private useLocalStorage: boolean;
  private uploadDir: string;

  constructor(private configService: ConfigService) {
    // Check if AWS credentials are configured
    const awsAccessKey = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const awsSecretKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.useLocalStorage =
      !awsAccessKey ||
      !awsSecretKey ||
      awsAccessKey === 'your-access-key-id' ||
      this.configService.get<string>('NODE_ENV') === 'development';

    if (this.useLocalStorage) {
      this.logger.log(
        'Using local file storage (AWS credentials not configured or in development mode)',
      );
      this.uploadDir = path.join(process.cwd(), 'uploads');

      // Create uploads directory if it doesn't exist
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
    } else {
      this.logger.log('Using AWS S3 storage');
      this.s3 = new AWS.S3({
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecretKey,
        region: this.configService.get<string>('AWS_REGION'),
      });
      this.bucket = this.configService.get<string>('AWS_S3_BUCKET') || 'bodecart';
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    filename?: string,
    allowedMimeTypes?: string[],
    maxSize?: number,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Validate file size
    const effectiveMaxSize = maxSize || 5 * 1024 * 1024; // default 5MB
    if (file.size > effectiveMaxSize) {
      throw new BadRequestException(
        `File size exceeds ${Math.round(effectiveMaxSize / 1024 / 1024)}MB limit`,
      );
    }

    // Validate file type
    const defaultAllowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
    const mimeTypes = allowedMimeTypes || defaultAllowedMimeTypes;
    if (!mimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed',
      );
    }

    const fileExtension = file.originalname.split('.').pop();
    const key = `${folder}/${filename || Date.now()}.${fileExtension}`;

    if (this.useLocalStorage) {
      // Save file locally
      try {
        const folderPath = path.join(this.uploadDir, folder);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const filePath = path.join(this.uploadDir, key);
        fs.writeFileSync(filePath, file.buffer);

        // Use relative URL so it works with frontend proxy
        const fileUrl = `/uploads/${key.replace(/\\/g, '/')}`;
        this.logger.log(`File uploaded successfully (local): ${fileUrl}`);
        return fileUrl;
      } catch (error) {
        this.logger.error(`Failed to upload file locally: ${error.message}`, error.stack);
        throw new BadRequestException('Failed to upload file');
      }
    } else {
      // Upload to S3
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      };

      try {
        const result = await this.s3.upload(params).promise();
        this.logger.log(`File uploaded successfully (S3): ${result.Location}`);
        return result.Location;
      } catch (error) {
        this.logger.error(`Failed to upload file to S3: ${error.message}`, error.stack);
        throw new BadRequestException('Failed to upload file');
      }
    }
  }

  async uploadFiles(files: Express.Multer.File[], folder: string): Promise<string[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    const uploadPromises = files.map((file, index) =>
      this.uploadFile(file, folder, `${Date.now()}-${index}`),
    );

    return Promise.all(uploadPromises);
  }

  async deleteFile(url: string): Promise<void> {
    try {
      if (this.useLocalStorage) {
        // Delete file from local storage
        const urlParts = url.split('/uploads/');
        if (urlParts.length < 2) {
          throw new BadRequestException('Invalid file URL');
        }
        const filePath = path.join(this.uploadDir, urlParts[1]);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`File deleted successfully (local): ${filePath}`);
        }
      } else {
        // Delete file from S3
        const key = url.split('.com/')[1];
        if (!key) {
          throw new BadRequestException('Invalid file URL');
        }

        const params: AWS.S3.DeleteObjectRequest = {
          Bucket: this.bucket,
          Key: key,
        };

        await this.s3.deleteObject(params).promise();
        this.logger.log(`File deleted successfully (S3): ${key}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to delete file');
    }
  }

  async deleteFiles(urls: string[]): Promise<void> {
    const deletePromises = urls.map((url) => this.deleteFile(url));
    await Promise.all(deletePromises);
  }
}

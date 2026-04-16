import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class GoogleAuthDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIs...',
    description: 'Google ID token obtained from Google Sign-In on the client',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({
    enum: UserRole,
    example: 'CLIENT',
    description: 'Role for new user creation (ignored if user already exists)',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

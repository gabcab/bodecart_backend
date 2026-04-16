import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  @IsEmail({}, { message: 'Por favor ingresa un correo válido' })
  @IsNotEmpty({ message: 'El correo es requerido' })
  email: string;
}

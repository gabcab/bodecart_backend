import { ApiProperty } from '@nestjs/swagger';

// Client model only has userId - no additional editable fields
// All client-specific data (addresses, etc.) are managed through their own endpoints
export class UpdateClientDto {
  // Reserved for future client-specific settings
}

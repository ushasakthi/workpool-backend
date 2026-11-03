import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class CreateSosDto {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsMongoId()
  bookingId!: string;
}

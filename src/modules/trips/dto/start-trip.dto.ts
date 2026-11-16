import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class StartTripDto {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsMongoId()
  rideId!: string;
}

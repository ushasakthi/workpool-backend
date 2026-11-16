import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, Matches, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsMongoId()
  rideId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 8 })
  @IsInt()
  @Min(1)
  @Max(8)
  seatsRequested!: number;

  @ApiProperty({
    example: '2026-11-18',
    description: 'Day of the trip, Colombo time',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'travelDate must look like 2026-11-18',
  })
  travelDate!: string;
}

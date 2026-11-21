import { IsInt, IsMongoId, Matches, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @IsMongoId()
  rideId!: string;

  @IsInt()
  @Min(1)
  @Max(8)
  seatsRequested!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'travelDate must look like 2026-11-18',
  })
  travelDate!: string;
}

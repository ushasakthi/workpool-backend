import { IsMongoId } from 'class-validator';

export class StartTripDto {
  @IsMongoId()
  rideId!: string;
}

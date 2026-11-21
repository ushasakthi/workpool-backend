import { IsMongoId } from 'class-validator';

export class TravelDaysQueryDto {
  @IsMongoId()
  rideId!: string;
}

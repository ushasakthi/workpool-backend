import { IsMongoId } from 'class-validator';

export class CreateSosDto {
  @IsMongoId()
  bookingId!: string;
}

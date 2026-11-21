import { IsEnum, IsOptional } from 'class-validator';
import { BookingStatus } from '../../../common/constants';

export enum BookingSide {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
}

export class ListMyBookingsQueryDto {
  @IsOptional()
  @IsEnum(BookingSide)
  as: BookingSide = BookingSide.PASSENGER;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

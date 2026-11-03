import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BookingStatus } from '../../../common/constants';

export enum BookingSide {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
}

export class ListMyBookingsQueryDto {
  @ApiPropertyOptional({
    enum: BookingSide,
    default: BookingSide.PASSENGER,
    description:
      '"passenger" = bookings I made, "driver" = requests on rides I drive',
  })
  @IsOptional()
  @IsEnum(BookingSide)
  as: BookingSide = BookingSide.PASSENGER;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

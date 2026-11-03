import { NotFoundException } from '@nestjs/common';
import { isValidObjectId, Model } from 'mongoose';
import { BookingStatus } from '../../../common/constants';
import { RidesService } from '../../rides/rides.service';
import { BookingDocument } from '../schemas/booking.schema';

export interface BookingParties {
  status: BookingStatus;
  passengerId: string;
  driverId: string;
}

// who is on each side of a booking, used by the booking guards, reviews and reports
export async function findBookingParties(
  bookingId: string | undefined,
  bookingModel: Model<BookingDocument>,
  ridesService: RidesService,
): Promise<BookingParties> {
  if (!bookingId || !isValidObjectId(bookingId)) {
    throw new NotFoundException('Booking not found');
  }

  const booking = await bookingModel
    .findById(bookingId)
    .select('rideId passengerId status')
    .exec();
  if (!booking) {
    throw new NotFoundException('Booking not found');
  }

  const ride = await ridesService.getRideOrThrow(String(booking.rideId));
  return {
    status: booking.status,
    passengerId: String(booking.passengerId),
    driverId: String(ride.driverId),
  };
}

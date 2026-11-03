import { BookingStatus, RideStatus, Weekday } from '../../../common/constants';
import { GeoPointView } from '../../rides/serializers/ride.serializer';
import { BookingDocument } from '../schemas/booking.schema';

export interface BookingView {
  id: string;
  rideId: string;
  passengerId: string;
  status: BookingStatus;
  seatsRequested: number;
  requestedAt: Date;
  respondedAt?: Date;
  pickupVerifiedAt?: Date;
}

// a booking in a list, with enough of the ride and the other person to show a card
export interface BookingListItem extends BookingView {
  // passenger side only, while the booking is accepted and not picked up yet
  pickupPin?: string;
  ride: {
    origin: GeoPointView;
    destination: GeoPointView;
    departureTime: Date;
    daysOfWeek: Weekday[];
    seatsAvailable: number;
    // shared fuel cost, not a fare
    costContribution: number;
    status: RideStatus;
  };
  // true once I've rated the other person on this (completed) booking
  reviewedByMe: boolean;
  // the driver when I'm the passenger, the passenger when I'm the driver
  otherParty: {
    id: string;
    name: string;
    photoUrl?: string;
    // 0-100, null until calculated
    trustScore: number | null;
  };
}

export function serializeBooking(booking: BookingDocument): BookingView {
  return {
    id: booking.id,
    rideId: String(booking.rideId),
    passengerId: String(booking.passengerId),
    status: booking.status,
    seatsRequested: booking.seatsRequested,
    requestedAt: booking.requestedAt,
    respondedAt: booking.respondedAt,
    pickupVerifiedAt: booking.pickupVerifiedAt,
  };
}

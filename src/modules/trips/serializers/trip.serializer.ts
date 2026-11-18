import { TripStatus } from '../../../common/constants';
import { GeoPointView } from '../../rides/serializers/ride.serializer';

// Home "Start trip" card: one of the driver's rides that runs today
export interface TodayRideView {
  rideId: string;
  origin: GeoPointView;
  destination: GeoPointView;
  departureTime: Date;
  // accepted (or already completed) bookings for today
  riders: number;
  // 30 min before departure, today
  canStartAt: Date;
  tripId: string | null;
  tripStatus: TripStatus | null;
}

export interface TripStopView {
  bookingId: string;
  passenger: { id: string; name: string; trustScore: number | null };
  seats: number;
  // everyone is picked up at the ride's start until pickup spots exist
  pickupLabel: string;
  // the rider's home or work, whichever is nearer the ride's end
  dropOffLabel: string;
  pickedUpAt?: Date;
  droppedOffAt?: Date;
}

interface TripBase {
  id: string;
  rideId: string;
  date: string;
  startedAt: Date;
  origin: GeoPointView;
  destination: GeoPointView;
  departureTime: Date;
}

export interface DriverTripView extends TripBase {
  side: 'driver';
  // in drop-off order, nearest the start first
  stops: TripStopView[];
}

export interface PassengerTripView extends TripBase {
  side: 'passenger';
  driver: { id: string; name: string; trustScore: number | null };
  vehicle: { make: string; model: string; plateNumber: string } | null;
  booking: {
    id: string;
    seats: number;
    // per seat, the total is costContribution × seats
    costContribution: number;
    // only until the driver has checked it
    pickupPin?: string;
    pickedUpAt?: Date;
  };
  pickupLabel: string;
  dropOffLabel: string;
  stopNumber: number;
  stopCount: number;
}

export type TripView = DriverTripView | PassengerTripView;

// Trip finished screen
export interface TripSummaryView {
  id: string;
  origin: GeoPointView;
  destination: GeoPointView;
  startedAt: Date;
  finishedAt: Date;
  riders: number;
  costsShared: number;
  co2SavedKg: number;
  // for "Rate your riders"
  completedBookingIds: string[];
}

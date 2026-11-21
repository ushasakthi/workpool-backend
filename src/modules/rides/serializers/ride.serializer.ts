import {
  RideStatus,
  VerificationStatus,
  Weekday,
} from '../../../common/constants';
import { GeoPoint } from '../../../common/schemas/geo-point.schema';
import { SmsResult } from '../matching/smart-matching.service';
import { RideDocument } from '../schemas/ride.schema';

export interface GeoPointView {
  lat: number;
  lng: number;
  label?: string;
}

export interface RideView {
  id: string;
  driverId: string;
  vehicleId: string;
  origin: GeoPointView;
  destination: GeoPointView;
  // places the driver passes through, in order
  via: GeoPointView[];
  departureTime: Date;
  daysOfWeek: Weekday[];
  seatsAvailable: number;
  // shared fuel cost, not a fare
  costContribution: number;
  status: RideStatus;
}

export interface RideDriverView {
  id: string;
  name: string;
  photoUrl?: string;
  verification: {
    identityStatus: VerificationStatus;
    workplaceStatus: VerificationStatus;
  };
  // 0-100, null until calculated
  trustScore: number | null;
}

// a ride as seen by a passenger: their match score, how far the pickup is
// from their home, and who's driving
export interface RideWithMatchView extends RideView {
  match: SmsResult;
  // null when the passenger has no home location
  pickupDistanceKm: number | null;
  driver: RideDriverView;
}

export interface RideSearchPage {
  items: RideWithMatchView[];
  page: number;
  limit: number;
  total: number;
}

export type RideDetailView = RideWithMatchView;

export function serializeRide(ride: RideDocument): RideView {
  return {
    id: ride.id,
    driverId: String(ride.driverId),
    vehicleId: String(ride.vehicleId),
    origin: toPointView(ride.origin),
    destination: toPointView(ride.destination),
    via: (ride.via ?? []).map(toPointView),
    departureTime: ride.departureTime,
    daysOfWeek: ride.daysOfWeek ?? [],
    seatsAvailable: ride.seatsAvailable,
    costContribution: ride.costContribution,
    status: ride.status,
  };
}

function toPointView(point: GeoPoint): GeoPointView {
  return { lat: point.lat, lng: point.lng, label: point.label };
}

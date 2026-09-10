import { RideStatus, Weekday } from '../../../common/constants';
import { GeoPoint } from '../../../common/schemas/geo-point.schema';
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
  departureTime: Date;
  daysOfWeek: Weekday[];
  seatsAvailable: number;
  // Cost-sharing contribution toward shared fuel / running costs — not a fare.
  costContribution: number;
  status: RideStatus;
}

export function serializeRide(ride: RideDocument): RideView {
  return {
    id: ride.id,
    driverId: String(ride.driverId),
    vehicleId: String(ride.vehicleId),
    origin: toPointView(ride.origin),
    destination: toPointView(ride.destination),
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

import { Injectable } from '@nestjs/common';
import { Weekday } from '../../../common/constants';
import { GeoPoint } from '../../../common/schemas/geo-point.schema';
import { TravelProfile } from '../../users/schemas/travel-profile.schema';
import { Ride } from '../schemas/ride.schema';

// see docs/sms-formula.md before changing any of these
const WEIGHTS = { route: 0.4, time: 0.3, workplace: 0.2, availability: 0.1 };
const PICKUP_CUTOFF_KM = 5;
const DROPOFF_CUTOFF_KM = 2;
const EARTH_RADIUS_KM = 6371;
// Sri Lanka is UTC+5:30 all year, no daylight saving
const COLOMBO_OFFSET_MINUTES = 5 * 60 + 30;

export interface SmsBreakdown {
  route: number;
  time: number;
  workplace: number;
  availability: number;
}

export interface SmsResult {
  score: number;
  breakdown: SmsBreakdown;
}

// only the ride fields the score needs, so tests don't have to build a full Ride
export type ScorableRide = Pick<
  Ride,
  'origin' | 'destination' | 'departureTime' | 'daysOfWeek'
>;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// straight-line distance in km between two points on the Earth
export function haversine(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// 0 km → 1, cutoff or more → 0, straight line in between
function distanceScore(km: number, cutoffKm: number): number {
  return Math.max(0, 1 - km / cutoffKm);
}

export function routeScore(home?: GeoPoint, origin?: GeoPoint): number {
  if (!home || !origin) return 0;
  return distanceScore(haversine(home, origin), PICKUP_CUTOFF_KM);
}

export function workplaceScore(
  work?: GeoPoint,
  destination?: GeoPoint,
): number {
  if (!work || !destination) return 0;
  return distanceScore(haversine(work, destination), DROPOFF_CUTOFF_KM);
}

// "08:30" → 510
export function hhmmToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

// departureTime is stored in UTC, we need the Colombo time of day
export function colomboMinutesOfDay(date: Date): number {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (utcMinutes + COLOMBO_OFFSET_MINUTES) % (24 * 60);
}

export function timeScore(
  workStartTime?: string,
  departureTime?: Date,
): number {
  if (!workStartTime || !departureTime) return 0;

  const gap =
    hhmmToMinutes(workStartTime) - colomboMinutesOfDay(new Date(departureTime));

  if (gap < 0 || gap > 120) return 0;
  if (gap < 30) return gap / 30;
  if (gap <= 90) return 1;
  return (120 - gap) / 30;
}

export function availabilityScore(
  daysAvailable: Weekday[] = [],
  rideDays: Weekday[] = [],
): number {
  if (daysAvailable.length === 0) return 0;
  const shared = daysAvailable.filter((day) => rideDays.includes(day));
  return shared.length / daysAvailable.length;
}

@Injectable()
export class SmartMatchingService {
  calculateScore(
    profile: Partial<TravelProfile> | undefined,
    ride: ScorableRide,
  ): SmsResult {
    const breakdown: SmsBreakdown = {
      route: routeScore(profile?.homeLocation, ride.origin),
      time: timeScore(profile?.workStartTime, ride.departureTime),
      workplace: workplaceScore(profile?.workLocation, ride.destination),
      availability: availabilityScore(profile?.daysAvailable, ride.daysOfWeek),
    };

    const score =
      WEIGHTS.route * breakdown.route +
      WEIGHTS.time * breakdown.time +
      WEIGHTS.workplace * breakdown.workplace +
      WEIGHTS.availability * breakdown.availability;

    return { score, breakdown };
  }
}

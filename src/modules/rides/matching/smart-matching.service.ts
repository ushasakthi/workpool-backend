import { Injectable } from '@nestjs/common';
import { Weekday } from '../../../common/constants';
import { GeoPoint } from '../../../common/schemas/geo-point.schema';
import { TravelProfile } from '../../users/schemas/travel-profile.schema';
import { Ride } from '../schemas/ride.schema';

// see docs/sms-formula.md before changing any of these
const WEIGHTS = { route: 0.4, time: 0.3, workplace: 0.2, availability: 0.1 };
// the driver passes near you, so the pickup should be close to home
export const PICKUP_CUTOFF_KM = 3;
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
> &
  Partial<Pick<Ride, 'via'>>;

export interface RoutePoint {
  // the closest point on the route
  point: GeoPoint;
  // how far that is from the point we asked about
  distanceKm: number;
  // how far along the route it is, from the start
  alongKm: number;
}

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

// start → passing-through places → destination
export function rideRoute(
  ride: Partial<Pick<Ride, 'via'>> & Pick<Ride, 'origin' | 'destination'>,
): GeoPoint[] {
  return [ride.origin, ...(ride.via ?? []), ride.destination];
}

// lat/lng as flat x/y in km around refLat; accurate enough across a city
function toFlatKm(p: GeoPoint, refLat: number): { x: number; y: number } {
  return {
    x: toRadians(p.lng) * Math.cos(toRadians(refLat)) * EARTH_RADIUS_KM,
    y: toRadians(p.lat) * EARTH_RADIUS_KM,
  };
}

// the point on the route's straight segments closest to `point`
export function nearestPointOnRoute(
  point: GeoPoint,
  route: GeoPoint[],
): RoutePoint {
  const p = toFlatKm(point, point.lat);
  let best: RoutePoint = {
    point: route[0],
    distanceKm: haversine(point, route[0]),
    alongKm: 0,
  };
  let walkedKm = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const a = toFlatKm(route[i], point.lat);
    const b = toFlatKm(route[i + 1], point.lat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    // t = 0 at the segment's start, 1 at its end
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq),
          );
    const distanceKm = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    const segmentKm = Math.sqrt(lengthSq);

    if (distanceKm < best.distanceKm) {
      best = {
        point: {
          lat: route[i].lat + t * (route[i + 1].lat - route[i].lat),
          lng: route[i].lng + t * (route[i + 1].lng - route[i].lng),
        },
        distanceKm,
        alongKm: walkedKm + t * segmentKm,
      };
    }
    walkedKm += segmentKm;
  }
  return best;
}

// how close the driver's route passes to home; 0 if they drive the other way
export function routeScore(
  home: GeoPoint | undefined,
  work: GeoPoint | undefined,
  route: GeoPoint[],
): number {
  if (!home || route.length === 0) return 0;
  const pickup = nearestPointOnRoute(home, route);
  // reaching work before home along the route = wrong direction
  if (work && nearestPointOnRoute(work, route).alongKm < pickup.alongKm) {
    return 0;
  }
  return distanceScore(pickup.distanceKm, PICKUP_CUTOFF_KM);
}

// uses whichever stop is closest to work: a passing-through place or the destination
export function workplaceScore(
  work?: GeoPoint,
  stops: GeoPoint[] = [],
): number {
  if (!work || stops.length === 0) return 0;
  const closestKm = Math.min(...stops.map((stop) => haversine(work, stop)));
  return distanceScore(closestKm, DROPOFF_CUTOFF_KM);
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
      route: routeScore(
        profile?.homeLocation,
        profile?.workLocation,
        rideRoute(ride),
      ),
      time: timeScore(profile?.workStartTime, ride.departureTime),
      workplace: workplaceScore(profile?.workLocation, [
        ...(ride.via ?? []),
        ride.destination,
      ]),
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

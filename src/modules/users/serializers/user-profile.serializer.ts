import { createHash } from 'crypto';
import {
  PreferredRole,
  UserRole,
  VerificationStatus,
  Weekday,
} from '../../../common/constants';
import { UserDocument } from '../schemas/user.schema';
import { GeoPoint } from '../schemas/travel-profile.schema';

// Privacy transform for User.travelProfile.
//
// Exact home/work coordinates never leave the server for anyone but the profile
// owner — they stay server-side for the Smart Matching Score (Sprint 4). Other
// users get a point fuzzed by 300–500 m.
//
// The fuzz is DETERMINISTIC per (userId, kind): every request returns the same
// approximate point, so an observer can't average many responses back to the
// true location.
const MIN_JITTER_METRES = 300;
const MAX_JITTER_METRES = 500;
const METRES_PER_DEGREE_LAT = 111_320;
const APPROX_DECIMALS = 5;

export interface GeoPointView {
  lat: number;
  lng: number;
  label?: string;
}

export interface TravelProfileView {
  homeLocation?: GeoPointView;
  workLocation?: GeoPointView;
  workStartTime?: string;
  workEndTime?: string;
  daysAvailable: Weekday[];
  preferredRole?: PreferredRole;
  // true when the coordinates above have been fuzzed for privacy (non-owner view).
  approximate: boolean;
}

export interface PublicUserProfile {
  id: string;
  name: string;
  role: UserRole;
  photoUrl?: string;
  verification: {
    identityStatus: VerificationStatus;
    workplaceStatus: VerificationStatus;
  };
  travelProfile?: TravelProfileView;
}

export interface OwnUserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  photoUrl?: string;
  linkedinUrl?: string;
  verification: UserDocument['verification'];
  travelProfile?: TravelProfileView;
}

// Single entry point: applies the jitter only when the requester isn't the owner.
export function serializeUserProfile(
  user: UserDocument,
  requesterId: string,
): OwnUserProfile | PublicUserProfile {
  return user.id === requesterId
    ? serializeOwnProfile(user)
    : serializePublicProfile(user);
}

export function serializeOwnProfile(user: UserDocument): OwnUserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    photoUrl: photoUrl(user),
    linkedinUrl: user.linkedinUrl,
    verification: user.verification,
    travelProfile: serializeTravelProfile(user, true),
  };
}

export function serializePublicProfile(user: UserDocument): PublicUserProfile {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    photoUrl: photoUrl(user),
    verification: {
      identityStatus: user.verification.identityStatus,
      workplaceStatus: user.verification.workplaceStatus,
    },
    travelProfile: serializeTravelProfile(user, false),
  };
}

// The stored value is a local filename — expose it only as the authenticated fetch
// route, with a version tag so the client re-fetches after the photo is replaced.
function photoUrl(user: UserDocument): string | undefined {
  if (!user.photoUrl) {
    return undefined;
  }
  const updatedAt = (user as unknown as { updatedAt?: Date }).updatedAt;
  const version = updatedAt instanceof Date ? updatedAt.getTime() : 0;
  return `/users/${user.id}/photo?v=${version}`;
}

function serializeTravelProfile(
  user: UserDocument,
  forOwner: boolean,
): TravelProfileView | undefined {
  const profile = user.travelProfile;
  if (!profile) {
    return undefined;
  }

  const common = {
    workStartTime: profile.workStartTime,
    workEndTime: profile.workEndTime,
    daysAvailable: profile.daysAvailable ?? [],
    preferredRole: profile.preferredRole,
  };

  if (forOwner) {
    return {
      ...common,
      homeLocation: toGeoPointView(profile.homeLocation),
      workLocation: toGeoPointView(profile.workLocation),
      approximate: false,
    };
  }

  return {
    ...common,
    homeLocation: profile.homeLocation
      ? approximatePoint(profile.homeLocation, `${user.id}:home`)
      : undefined,
    workLocation: profile.workLocation
      ? {
          ...approximatePoint(profile.workLocation, `${user.id}:work`),
          // Workplace name is public professional info by default; the user can
          // opt to hide it. Home address labels are never shared.
          label: profile.hideWorkplaceName
            ? undefined
            : profile.workLocation.label,
        }
      : undefined,
    approximate: true,
  };
}

function toGeoPointView(point?: GeoPoint): GeoPointView | undefined {
  if (!point) {
    return undefined;
  }
  return { lat: point.lat, lng: point.lng, label: point.label };
}

function approximatePoint(point: GeoPoint, seed: string): GeoPointView {
  const [distanceUnit, bearingUnit] = deterministicUnitPair(seed);
  const distanceMetres =
    MIN_JITTER_METRES + distanceUnit * (MAX_JITTER_METRES - MIN_JITTER_METRES);
  const bearing = bearingUnit * 2 * Math.PI;

  const latRadians = (point.lat * Math.PI) / 180;
  const dLat = (distanceMetres * Math.cos(bearing)) / METRES_PER_DEGREE_LAT;
  const dLng =
    (distanceMetres * Math.sin(bearing)) /
    (METRES_PER_DEGREE_LAT * Math.max(Math.cos(latRadians), 0.01));

  return {
    lat: round(point.lat + dLat, APPROX_DECIMALS),
    lng: round(point.lng + dLng, APPROX_DECIMALS),
  };
}

// Two independent [0, 1) values derived from a SHA-256 of the seed.
function deterministicUnitPair(seed: string): [number, number] {
  const digest = createHash('sha256').update(seed).digest();
  return [
    digest.readUInt32BE(0) / 0x1_0000_0000,
    digest.readUInt32BE(4) / 0x1_0000_0000,
  ];
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

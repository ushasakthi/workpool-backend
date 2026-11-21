import { createHash } from 'crypto';
import {
  PreferredRole,
  UserRole,
  VerificationStatus,
  Weekday,
} from '../../../common/constants';
import { UserDocument } from '../schemas/user.schema';
import { GeoPoint } from '../schemas/travel-profile.schema';

// Only the owner sees exact home/work locations. Others get a point moved
// 300-500 m. The offset is always the same for a user, so it can't be averaged out.
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
  // true if the coordinates are fuzzed
  approximate: boolean;
}

// the public part of the Trust Score. The raw complaintCount stays private
// (it includes open reports, so it could reveal who just reported someone)
export interface TrustScoreView {
  // 0-100, null until calculated
  score: number | null;
  completedRides: number;
  ratingCount: number;
  averageRating: number;
  cancellationCount: number;
  upheldComplaints: number;
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
  trustScore: TrustScoreView;
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
  trustScore: TrustScoreView;
  travelProfile?: TravelProfileView;
  // own profile only, never in the public one
  emergencyContact?: { name: string; phone: string };
}

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
    trustScore: serializeTrustScore(user),
    travelProfile: serializeTravelProfile(user, true),
    emergencyContact: user.emergencyContact
      ? { name: user.emergencyContact.name, phone: user.emergencyContact.phone }
      : undefined,
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
    trustScore: serializeTrustScore(user),
    travelProfile: serializeTravelProfile(user, false),
  };
}

function serializeTrustScore(user: UserDocument): TrustScoreView {
  const trust = user.trustScore;
  return {
    score: trust?.score ?? null,
    completedRides: trust?.completedRides ?? 0,
    ratingCount: trust?.ratingCount ?? 0,
    averageRating: trust?.averageRating ?? 0,
    cancellationCount: trust?.cancellationCount ?? 0,
    upheldComplaints: trust?.upheldComplaints ?? 0,
  };
}

// return the photo route, not the filename. ?v= makes the app reload a new photo
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
          // workplace name can be hidden, home label is never shared
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

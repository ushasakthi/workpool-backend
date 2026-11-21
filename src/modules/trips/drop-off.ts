import { haversine } from '../rides/matching/smart-matching.service';
import {
  GeoPointView,
  TravelProfileView,
} from '../users/serializers/user-profile.serializer';

// a rider gets off at home or work, whichever is nearer the ride's end
// (a morning ride ends near work, an evening ride near home)
export function dropOffPoint(
  rideEnd: GeoPointView,
  profile?: TravelProfileView,
): GeoPointView {
  const home = profile?.homeLocation;
  const work = profile?.workLocation;
  if (!home || !work) {
    return rideEnd;
  }
  return haversine(work, rideEnd) <= haversine(home, rideEnd) ? work : home;
}

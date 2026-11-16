import { Weekday } from '../../common/constants';
import { colomboMinutesOfDay } from '../rides/matching/smart-matching.service';

// Sri Lanka has no daylight saving, so the offset never changes
export const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
// Date.getUTCDay() order
export const DAY_BY_INDEX = [
  Weekday.SUN,
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
];

// The pickup PIN can only be checked on one of the ride's days, within
// windowMinutes before or after departure (Colombo time). Doesn't wrap past
// midnight, which is fine for commute times.
export function isWithinPickupWindow(
  ride: { departureTime: Date; daysOfWeek: Weekday[] },
  now: Date,
  windowMinutes: number,
): boolean {
  const departure = new Date(ride.departureTime);
  const windowMs = windowMinutes * 60 * 1000;

  // the ride hasn't started running yet
  if (now.getTime() < departure.getTime() - windowMs) return false;

  const today =
    DAY_BY_INDEX[new Date(now.getTime() + COLOMBO_OFFSET_MS).getUTCDay()];
  if (!ride.daysOfWeek.includes(today)) return false;

  const gap = Math.abs(
    colomboMinutesOfDay(now) - colomboMinutesOfDay(departure),
  );
  return gap <= windowMinutes;
}

import { Weekday } from '../../common/constants';
import { COLOMBO_OFFSET_MS, DAY_BY_INDEX } from './pickup-window';

const MAX_DAYS_AHEAD = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// the Colombo calendar day of an instant, as "2026-11-18"
export function colomboDateString(instant: Date): string {
  return new Date(instant.getTime() + COLOMBO_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

// travelDate must be a day the ride runs, from today up to 7 days ahead (Colombo time)
export function isValidTravelDate(
  ride: { daysOfWeek: Weekday[] },
  travelDate: string,
  now: Date,
): boolean {
  // a "YYYY-MM-DD" string parses as midnight UTC, so both sides line up
  const travel = new Date(travelDate);
  // catches impossible days like "2026-02-30", which JS rolls over to 2 March
  if (
    Number.isNaN(travel.getTime()) ||
    travel.toISOString().slice(0, 10) !== travelDate
  ) {
    return false;
  }

  const today = new Date(colomboDateString(now));
  const daysAhead = (travel.getTime() - today.getTime()) / DAY_MS;
  if (daysAhead < 0 || daysAhead > MAX_DAYS_AHEAD) return false;

  return ride.daysOfWeek.includes(DAY_BY_INDEX[travel.getUTCDay()]);
}

// every bookable day for this ride, from today up to 7 days ahead
export function upcomingTravelDates(
  ride: { daysOfWeek: Weekday[] },
  now: Date,
): string[] {
  const dates: string[] = [];
  for (let i = 0; i <= MAX_DAYS_AHEAD; i++) {
    const date = colomboDateString(new Date(now.getTime() + i * DAY_MS));
    if (isValidTravelDate(ride, date, now)) dates.push(date);
  }
  return dates;
}

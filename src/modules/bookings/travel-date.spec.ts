import { Weekday } from '../../common/constants';
import {
  colomboDateString,
  isValidTravelDate,
  upcomingTravelDates,
} from './travel-date';

const weekdayRide = {
  daysOfWeek: [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI],
};

// a Colombo date + time as a real instant
const colombo = (iso: string) => new Date(`${iso}+05:30`);

// Wed 18 Nov 2026, 07:00 in Colombo
const now = colombo('2026-11-18T07:00:00');

describe('colomboDateString', () => {
  it('uses the Colombo day, not the UTC day', () => {
    // 00:30 in Colombo is still the previous day in UTC
    expect(colomboDateString(colombo('2026-11-18T00:30:00'))).toBe(
      '2026-11-18',
    );
  });
});

describe('isValidTravelDate', () => {
  it('allows today', () => {
    expect(isValidTravelDate(weekdayRide, '2026-11-18', now)).toBe(true);
  });

  it('allows a later day the ride runs', () => {
    expect(isValidTravelDate(weekdayRide, '2026-11-20', now)).toBe(true);
  });

  it('allows exactly 7 days ahead', () => {
    expect(isValidTravelDate(weekdayRide, '2026-11-25', now)).toBe(true);
  });

  it('refuses more than 7 days ahead', () => {
    expect(isValidTravelDate(weekdayRide, '2026-11-26', now)).toBe(false);
  });

  it('refuses a day in the past', () => {
    expect(isValidTravelDate(weekdayRide, '2026-11-17', now)).toBe(false);
  });

  it("refuses a day the ride doesn't run", () => {
    // Saturday
    expect(isValidTravelDate(weekdayRide, '2026-11-21', now)).toBe(false);
  });

  it('refuses a date that does not exist', () => {
    expect(isValidTravelDate(weekdayRide, '2026-02-30', now)).toBe(false);
  });
});

describe('upcomingTravelDates', () => {
  it('lists the ride days from today to 7 days ahead, skipping the weekend', () => {
    expect(upcomingTravelDates(weekdayRide, now)).toEqual([
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
    ]);
  });
});

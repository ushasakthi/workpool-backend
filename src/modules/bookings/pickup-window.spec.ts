import { Weekday } from '../../common/constants';
import { isWithinPickupWindow } from './pickup-window';

// first trip Mon 3 Nov 2025, 08:30 Colombo (= 03:00 UTC), every weekday
const ride = {
  departureTime: new Date('2025-11-03T03:00:00Z'),
  daysOfWeek: [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI],
};

// a Colombo date + time as a real instant
const colombo = (iso: string) => new Date(`${iso}+05:30`);

describe('isWithinPickupWindow', () => {
  it('allows the departure time itself', () => {
    expect(isWithinPickupWindow(ride, colombo('2025-11-05T08:30:00'), 60)).toBe(
      true,
    );
  });

  it('allows exactly 1 hour before and after', () => {
    expect(isWithinPickupWindow(ride, colombo('2025-11-05T07:30:00'), 60)).toBe(
      true,
    );
    expect(isWithinPickupWindow(ride, colombo('2025-11-05T09:30:00'), 60)).toBe(
      true,
    );
  });

  it('refuses more than 1 hour away', () => {
    expect(isWithinPickupWindow(ride, colombo('2025-11-05T07:29:00'), 60)).toBe(
      false,
    );
    expect(isWithinPickupWindow(ride, colombo('2025-11-05T09:31:00'), 60)).toBe(
      false,
    );
  });

  it('refuses the night before (the bug that was reported)', () => {
    expect(isWithinPickupWindow(ride, colombo('2025-11-04T22:41:00'), 60)).toBe(
      false,
    );
  });

  it('allows any time on a ride day with the widest testing window (1440)', () => {
    // 22:41 is 851 minutes after 08:30
    expect(
      isWithinPickupWindow(ride, colombo('2025-11-04T22:41:00'), 1440),
    ).toBe(true);
  });

  it("refuses the right time on a day the ride doesn't run", () => {
    // Sat 8 Nov 2025
    expect(isWithinPickupWindow(ride, colombo('2025-11-08T08:30:00'), 60)).toBe(
      false,
    );
  });

  it('refuses a ride day before the first trip', () => {
    // Fri 31 Oct 2025, before the ride starts on 3 Nov
    expect(isWithinPickupWindow(ride, colombo('2025-10-31T08:30:00'), 60)).toBe(
      false,
    );
  });

  it('uses the Colombo day, not the UTC day', () => {
    // Tue 4 Nov 00:30 Colombo is still Mon in UTC; a Tue-only 00:30 ride must match
    const lateRide = {
      departureTime: new Date('2025-11-03T19:00:00Z'),
      daysOfWeek: [Weekday.TUE],
    };
    expect(
      isWithinPickupWindow(lateRide, colombo('2025-11-04T00:30:00'), 60),
    ).toBe(true);
  });
});

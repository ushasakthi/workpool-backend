import { Weekday } from '../../../common/constants';
import {
  availabilityScore,
  haversine,
  routeScore,
  ScorableRide,
  SmartMatchingService,
  timeScore,
  workplaceScore,
} from './smart-matching.service';

// points from the worked example in docs/sms-formula.md
const HOME = { lat: 6.85, lng: 79.87 };
const WORK = { lat: 6.9271, lng: 79.8612 };
const ORIGIN = { lat: 6.868, lng: 79.87 };
const DESTINATION = { lat: 6.9361, lng: 79.8612 };
const FAR_AWAY = { lat: 7.2906, lng: 80.6337 }; // Kandy

const WEEKDAYS = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
];

// times are UTC, Colombo is +5:30 (01:45Z = 07:15 in Colombo)
const AT_0715_COLOMBO = new Date('2026-10-26T01:45:00.000Z');

describe('haversine', () => {
  it('is 0 for the same point', () => {
    expect(haversine(HOME, HOME)).toBe(0);
  });

  it('matches the worked example distance', () => {
    expect(haversine(HOME, ORIGIN)).toBeCloseTo(2.0015, 3);
  });
});

describe('routeScore', () => {
  it('is 1 when pickup is at home', () => {
    expect(routeScore(HOME, HOME)).toBe(1);
  });

  it('drops in a straight line with distance', () => {
    expect(routeScore(HOME, ORIGIN)).toBeCloseTo(0.5997, 3);
  });

  it('is 0 at 5 km or more', () => {
    expect(routeScore(HOME, FAR_AWAY)).toBe(0);
  });

  it('is 0 when home is missing', () => {
    expect(routeScore(undefined, ORIGIN)).toBe(0);
  });
});

describe('workplaceScore', () => {
  it('drops in a straight line with distance', () => {
    expect(workplaceScore(WORK, DESTINATION)).toBeCloseTo(0.4996, 3);
  });

  it('is 0 at 2 km or more', () => {
    expect(workplaceScore(WORK, FAR_AWAY)).toBe(0);
  });

  it('is 0 when work is missing', () => {
    expect(workplaceScore(undefined, DESTINATION)).toBe(0);
  });
});

describe('timeScore', () => {
  it('is 1 inside the 30-90 min window', () => {
    expect(timeScore('08:30', AT_0715_COLOMBO)).toBe(1);
  });

  it('is partial when the ride leaves only 15 min before work', () => {
    // 02:45Z = 08:15 Colombo
    expect(timeScore('08:30', new Date('2026-10-26T02:45:00.000Z'))).toBe(0.5);
  });

  it('is partial when the ride leaves 105 min before work', () => {
    // 01:15Z = 06:45 Colombo
    expect(timeScore('08:30', new Date('2026-10-26T01:15:00.000Z'))).toBe(0.5);
  });

  it('is 0 when the ride leaves after work starts', () => {
    // 03:30Z = 09:00 Colombo
    expect(timeScore('08:30', new Date('2026-10-26T03:30:00.000Z'))).toBe(0);
  });

  it('is 0 when workStartTime is missing', () => {
    expect(timeScore(undefined, AT_0715_COLOMBO)).toBe(0);
  });
});

describe('availabilityScore', () => {
  it('is the share of passenger days the ride covers', () => {
    expect(
      availabilityScore(WEEKDAYS, [Weekday.MON, Weekday.WED, Weekday.FRI]),
    ).toBe(0.6);
  });

  it('is 0 with no shared days', () => {
    expect(availabilityScore(WEEKDAYS, [Weekday.SAT])).toBe(0);
  });

  it('is 0 when the passenger has no days', () => {
    expect(availabilityScore([], WEEKDAYS)).toBe(0);
  });
});

describe('SmartMatchingService.calculateScore', () => {
  const service = new SmartMatchingService();

  const profile = {
    homeLocation: HOME,
    workLocation: WORK,
    workStartTime: '08:30',
    daysAvailable: WEEKDAYS,
  };

  it('matches the worked example (about 70%)', () => {
    const ride: ScorableRide = {
      origin: ORIGIN,
      destination: DESTINATION,
      departureTime: AT_0715_COLOMBO,
      daysOfWeek: [Weekday.MON, Weekday.WED, Weekday.FRI],
    };

    const result = service.calculateScore(profile, ride);

    expect(result.score).toBeCloseTo(0.6998, 3);
    expect(result.breakdown.time).toBe(1);
    expect(result.breakdown.availability).toBe(0.6);
  });

  it('is 1 for a perfect match', () => {
    const ride: ScorableRide = {
      origin: HOME,
      destination: WORK,
      departureTime: AT_0715_COLOMBO,
      daysOfWeek: WEEKDAYS,
    };

    expect(service.calculateScore(profile, ride).score).toBeCloseTo(1, 5);
  });

  it('is 0 when nothing overlaps', () => {
    const ride: ScorableRide = {
      origin: FAR_AWAY,
      destination: FAR_AWAY,
      departureTime: new Date('2026-10-26T03:30:00.000Z'),
      daysOfWeek: [Weekday.SAT],
    };

    expect(service.calculateScore(profile, ride).score).toBe(0);
  });

  it('is 0 when the passenger has no travel profile', () => {
    const ride: ScorableRide = {
      origin: ORIGIN,
      destination: DESTINATION,
      departureTime: AT_0715_COLOMBO,
      daysOfWeek: WEEKDAYS,
    };

    expect(service.calculateScore(undefined, ride).score).toBe(0);
  });
});

import { Weekday } from '../../../common/constants';
import {
  availabilityScore,
  haversine,
  nearestPointOnRoute,
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

// a straight north-south route, to make the geometry easy to check by hand
const SOUTH = { lat: 6.85, lng: 79.87 };
const NORTH = { lat: 6.95, lng: 79.87 };
// 0.01° of longitude at this latitude ≈ 1.1 km east of the line
const EAST_OF_MIDDLE = { lat: 6.9, lng: 79.88 };

describe('nearestPointOnRoute', () => {
  it('finds the closest point part-way along a segment, not just the ends', () => {
    const near = nearestPointOnRoute(EAST_OF_MIDDLE, [SOUTH, NORTH]);

    expect(near.point.lat).toBeCloseTo(6.9, 4);
    expect(near.distanceKm).toBeCloseTo(1.104, 2);
    // halfway along an ~11.1 km route
    expect(near.alongKm).toBeCloseTo(5.56, 1);
  });

  it('uses the start point for someone behind the start', () => {
    const near = nearestPointOnRoute(HOME, [ORIGIN, DESTINATION]);

    expect(near.alongKm).toBe(0);
    expect(near.distanceKm).toBeCloseTo(2.0015, 2);
  });

  it('checks every segment of a route with passing-through places', () => {
    // the route bends east through a via point right next to the passenger
    const via = { lat: 6.9, lng: 79.881 };
    expect(
      nearestPointOnRoute(EAST_OF_MIDDLE, [SOUTH, via, NORTH]).distanceKm,
    ).toBeLessThan(0.2);
  });
});

describe('routeScore', () => {
  it('is 1 when the route passes through home', () => {
    expect(routeScore(HOME, undefined, [HOME, WORK])).toBe(1);
  });

  it('drops in a straight line with distance from the route, 0 at 3 km', () => {
    // 2 km from the start: 1 − 2/3
    expect(routeScore(HOME, WORK, [ORIGIN, DESTINATION])).toBeCloseTo(
      0.3328,
      3,
    );
  });

  it('scores someone beside the middle of the route, not only near the start', () => {
    // ~1.1 km from the line, but ~5.6 km from the start
    expect(routeScore(EAST_OF_MIDDLE, NORTH, [SOUTH, NORTH])).toBeCloseTo(
      0.632,
      2,
    );
  });

  it('is 0 when the driver goes the other way', () => {
    // home is near the end of the route and work near its start
    expect(routeScore(NORTH, SOUTH, [SOUTH, NORTH])).toBe(0);
  });

  it('is 0 at 3 km or more', () => {
    expect(routeScore(FAR_AWAY, undefined, [ORIGIN, DESTINATION])).toBe(0);
  });

  it('is 0 when home is missing', () => {
    expect(routeScore(undefined, WORK, [ORIGIN, DESTINATION])).toBe(0);
  });
});

describe('workplaceScore', () => {
  it('drops in a straight line with distance', () => {
    expect(workplaceScore(WORK, [DESTINATION])).toBeCloseTo(0.4996, 3);
  });

  it('is 0 at 2 km or more', () => {
    expect(workplaceScore(WORK, [FAR_AWAY])).toBe(0);
  });

  it('is 0 when work is missing', () => {
    expect(workplaceScore(undefined, [DESTINATION])).toBe(0);
  });

  it('uses a passing-through stop when it is closer than the destination', () => {
    expect(workplaceScore(WORK, [WORK, FAR_AWAY])).toBe(1);
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

  it('matches the worked example (about 59%)', () => {
    const ride: ScorableRide = {
      origin: ORIGIN,
      destination: DESTINATION,
      departureTime: AT_0715_COLOMBO,
      daysOfWeek: [Weekday.MON, Weekday.WED, Weekday.FRI],
    };

    const result = service.calculateScore(profile, ride);

    expect(result.score).toBeCloseTo(0.5931, 3);
    // home is 2 km behind the start: 1 − 2/3
    expect(result.breakdown.route).toBeCloseTo(0.3328, 3);
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

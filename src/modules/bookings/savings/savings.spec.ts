import {
  driverSharing,
  monthRange,
  passengerSavings,
  SAVINGS_RATES,
  tripCost,
} from './savings';

describe('tripCost', () => {
  it('is road distance x rate + parking', () => {
    // 10 km straight line -> 13 km road -> 520 + 400 parking
    expect(tripCost(10)).toBeCloseTo(
      10 * SAVINGS_RATES.roadFactor * SAVINGS_RATES.perKmLkr +
        SAVINGS_RATES.parkingLkr,
    );
    expect(tripCost(10)).toBeCloseTo(920);
  });
});

describe('passengerSavings', () => {
  it('compares driving alone with the contributions paid', () => {
    const result = passengerSavings([
      { distanceKm: 10, contribution: 450 },
      { distanceKm: 10, contribution: 350 },
    ]);

    expect(result).toEqual({
      rides: 2,
      soloCost: 1840,
      contributions: 800,
      saved: 1040,
      avgContribution: 400,
    });
  });

  it('never shows negative savings', () => {
    expect(
      passengerSavings([{ distanceKm: 1, contribution: 2000 }]).saved,
    ).toBe(0);
  });

  it('is all zeros with no rides', () => {
    expect(passengerSavings([])).toEqual({
      rides: 0,
      soloCost: 0,
      contributions: 0,
      saved: 0,
      avgContribution: 0,
    });
  });
});

describe('driverSharing', () => {
  it('adds up what riders covered', () => {
    const result = driverSharing([
      { distanceKm: 10, contribution: 450 },
      { distanceKm: 10, contribution: 350 },
    ]);

    expect(result).toEqual({
      rides: 2,
      tripCost: 1840,
      costsShared: 800,
      yourShare: 1040,
      avgShared: 400,
    });
  });

  it('caps a contribution at the trip cost, so a driver never profits', () => {
    // 1 km trip costs 452, the rider paid 2000
    const result = driverSharing([{ distanceKm: 1, contribution: 2000 }]);

    expect(result.costsShared).toBe(452);
    expect(result.yourShare).toBe(0);
  });
});

describe('monthRange', () => {
  it('uses the Colombo calendar month', () => {
    const range = monthRange('2026-10');

    // 1 Oct 00:00 Colombo = 30 Sep 18:30 UTC
    expect(range.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });

  it('defaults to the current month in Colombo', () => {
    // 31 Oct 20:00 UTC is already 1 Nov in Colombo
    const range = monthRange(undefined, new Date('2026-10-31T20:00:00Z'));

    expect(range.month).toBe('2026-11');
    expect(range.isCurrentMonth).toBe(true);
  });
});

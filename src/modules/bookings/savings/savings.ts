// Cost-saving estimate, see docs/savings-estimate.md before changing these.
// Everything is in LKR and is an estimate: WorkPool doesn't know real fuel bills.
export const SAVINGS_RATES = {
  // fuel + wear per road km for an average car
  perKmLkr: 40,
  // a day's parking near a Colombo office
  parkingLkr: 400,
  // road distance is roughly 1.3x the straight-line distance
  roadFactor: 1.3,
  // kg CO2 per road km: 2.35 kg per litre of petrol ÷ 12 km/l
  co2PerKm: 0.196,
};

// one completed shared ride
export interface SavingsTrip {
  // straight line, origin to destination
  distanceKm: number;
  // what the passenger paid for their seats
  contribution: number;
}

export interface PassengerSavings {
  rides: number;
  // what the same trips would cost driving alone
  soloCost: number;
  contributions: number;
  saved: number;
  avgContribution: number;
  co2SavedKg: number;
}

export interface DriverSharing {
  rides: number;
  tripCost: number;
  // contributions, each capped at that trip's cost
  costsShared: number;
  yourShare: number;
  avgShared: number;
  co2SavedKg: number;
}

export function tripCost(distanceKm: number): number {
  const roadKm = distanceKm * SAVINGS_RATES.roadFactor;
  return roadKm * SAVINGS_RATES.perKmLkr + SAVINGS_RATES.parkingLkr;
}

// each shared trip is one car trip someone didn't make alone, 1 decimal
export function co2SavedKg(trips: SavingsTrip[]): number {
  const kg = trips.reduce(
    (sum, t) =>
      sum + t.distanceKm * SAVINGS_RATES.roadFactor * SAVINGS_RATES.co2PerKm,
    0,
  );
  return Math.round(kg * 10) / 10;
}

const round = (value: number) => Math.round(value);

// passenger: driving alone would have cost X, they paid contributions Y instead
export function passengerSavings(trips: SavingsTrip[]): PassengerSavings {
  const soloCost = trips.reduce((sum, t) => sum + tripCost(t.distanceKm), 0);
  const contributions = trips.reduce((sum, t) => sum + t.contribution, 0);
  return {
    rides: trips.length,
    soloCost: round(soloCost),
    contributions: round(contributions),
    // never shown as negative: a pricey ride doesn't "cost" savings
    saved: round(Math.max(0, soloCost - contributions)),
    avgContribution: trips.length ? round(contributions / trips.length) : 0,
    co2SavedKg: co2SavedKg(trips),
  };
}

// driver: riders' contributions cover part of the trip, but never more than
// it costs, so a driver can't make money from a ride (cost-sharing, not a fare)
export function driverSharing(trips: SavingsTrip[]): DriverSharing {
  const total = trips.reduce((sum, t) => sum + tripCost(t.distanceKm), 0);
  const shared = trips.reduce(
    (sum, t) => sum + Math.min(t.contribution, tripCost(t.distanceKm)),
    0,
  );
  return {
    rides: trips.length,
    tripCost: round(total),
    costsShared: round(shared),
    yourShare: round(total - shared),
    avgShared: trips.length ? round(shared / trips.length) : 0,
    co2SavedKg: co2SavedKg(trips),
  };
}

// Sri Lanka is UTC+5:30 all year, months follow the Colombo calendar
const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60_000;

export interface MonthRange {
  // "2026-10"
  month: string;
  start: Date;
  end: Date;
  isCurrentMonth: boolean;
}

// "2026-10" (or this month when missing) -> the UTC instants it covers
export function monthRange(month?: string, now: Date = new Date()): MonthRange {
  const colomboNow = new Date(now.getTime() + COLOMBO_OFFSET_MS);
  const current = `${colomboNow.getUTCFullYear()}-${String(colomboNow.getUTCMonth() + 1).padStart(2, '0')}`;
  const chosen = month ?? current;
  const [year, monthNumber] = chosen.split('-').map(Number);
  return {
    month: chosen,
    start: new Date(Date.UTC(year, monthNumber - 1, 1) - COLOMBO_OFFSET_MS),
    end: new Date(Date.UTC(year, monthNumber, 1) - COLOMBO_OFFSET_MS),
    isCurrentMonth: chosen === current,
  };
}

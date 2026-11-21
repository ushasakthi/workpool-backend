import { Injectable } from '@nestjs/common';
import { ReportSeverity, ReportStatus } from '../../common/constants';

// see docs/trust-score-formula.md before changing any of these
const POINTS = {
  identity: 20,
  workplace: 20,
  completedRides: 25,
  rating: 35,
  cancellations: 15,
  complaints: 25,
};
const FULL_MARKS_RIDES = 50;
const NO_RATINGS_SCORE = 0.5;
// one early cancellation shouldn't sink a brand-new user
const MIN_CANCELLATION_BASE = 5;
const COMPLAINTS_FOR_FULL_PENALTY = 5;
const SEVERITY_WEIGHTS = {
  [ReportSeverity.LOW]: 1,
  [ReportSeverity.MEDIUM]: 2,
  [ReportSeverity.HIGH]: 3,
};

export interface TrustInputs {
  identityVerified: boolean;
  workplaceVerified: boolean;
  completedRides: number;
  ratingCount: number;
  // 1-5, ignored when ratingCount is 0
  averageRating: number;
  cancellationCount: number;
  // weighted by severity, see complaintWeight
  complaintCount: number;
}

// points per part, cancellations and complaints are subtracted
export interface TrustBreakdown {
  identity: number;
  workplace: number;
  completedRides: number;
  rating: number;
  cancellations: number;
  complaints: number;
}

export interface TrustScoreResult {
  score: number;
  breakdown: TrustBreakdown;
}

// log-scaled: the first rides count most, 50 rides = 1
export function completedRidesScore(rides: number): number {
  if (rides <= 0) return 0;
  return Math.min(1, Math.log10(1 + rides) / Math.log10(1 + FULL_MARKS_RIDES));
}

// 1 star → 0, 5 stars → 1, no ratings yet → the midpoint
export function ratingScore(
  ratingCount: number,
  averageRating: number,
): number {
  if (ratingCount <= 0) return NO_RATINGS_SCORE;
  return Math.min(1, Math.max(0, (averageRating - 1) / 4));
}

// share of rides cancelled, so long histories aren't punished for the odd cancel
export function cancellationPenalty(
  cancellations: number,
  completedRides: number,
): number {
  if (cancellations <= 0) return 0;
  const base = Math.max(cancellations + completedRides, MIN_CANCELLATION_BASE);
  return cancellations / base;
}

// open reports count at the lowest weight until an admin decides; reviewed
// reports from before severity existed also count as 1
export function complaintWeight(
  status: ReportStatus,
  severity?: ReportSeverity,
): number {
  if (status === ReportStatus.DISMISSED) return 0;
  if (status === ReportStatus.OPEN || !severity) return 1;
  return SEVERITY_WEIGHTS[severity];
}

export function complaintPenalty(complaints: number): number {
  return Math.min(1, Math.max(0, complaints) / COMPLAINTS_FOR_FULL_PENALTY);
}

@Injectable()
export class TrustScoreService {
  calculate(inputs: TrustInputs): TrustScoreResult {
    const breakdown: TrustBreakdown = {
      identity: inputs.identityVerified ? POINTS.identity : 0,
      workplace: inputs.workplaceVerified ? POINTS.workplace : 0,
      completedRides:
        POINTS.completedRides * completedRidesScore(inputs.completedRides),
      rating:
        POINTS.rating * ratingScore(inputs.ratingCount, inputs.averageRating),
      cancellations:
        POINTS.cancellations *
        cancellationPenalty(inputs.cancellationCount, inputs.completedRides),
      complaints: POINTS.complaints * complaintPenalty(inputs.complaintCount),
    };

    const raw =
      breakdown.identity +
      breakdown.workplace +
      breakdown.completedRides +
      breakdown.rating -
      breakdown.cancellations -
      breakdown.complaints;

    return {
      score: Math.round(Math.min(100, Math.max(0, raw))),
      breakdown,
    };
  }
}

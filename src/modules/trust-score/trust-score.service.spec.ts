import { ReportSeverity, ReportStatus } from '../../common/constants';
import {
  cancellationPenalty,
  complaintPenalty,
  complaintWeight,
  completedRidesScore,
  ratingScore,
  TrustInputs,
  TrustScoreService,
} from './trust-score.service';

// the worked example in docs/trust-score-formula.md
const EXAMPLE: TrustInputs = {
  identityVerified: true,
  workplaceVerified: true,
  completedRides: 10,
  ratingCount: 8,
  averageRating: 4.6,
  cancellationCount: 1,
  complaintCount: 0,
};

const NEW_USER: TrustInputs = {
  identityVerified: false,
  workplaceVerified: false,
  completedRides: 0,
  ratingCount: 0,
  averageRating: 0,
  cancellationCount: 0,
  complaintCount: 0,
};

describe('completedRidesScore', () => {
  it('is 0 with no rides', () => {
    expect(completedRidesScore(0)).toBe(0);
  });

  it('grows fastest for the first rides (log scale)', () => {
    const firstFive = completedRidesScore(5) - completedRidesScore(0);
    const nextFive = completedRidesScore(10) - completedRidesScore(5);
    expect(firstFive).toBeGreaterThan(nextFive);
  });

  it('is full marks at 50 rides and stays there', () => {
    expect(completedRidesScore(50)).toBe(1);
    expect(completedRidesScore(200)).toBe(1);
  });
});

describe('ratingScore', () => {
  it('maps 1 star to 0 and 5 stars to 1', () => {
    expect(ratingScore(3, 1)).toBe(0);
    expect(ratingScore(3, 5)).toBe(1);
  });

  it('starts new users at the midpoint', () => {
    expect(ratingScore(0, 0)).toBe(0.5);
  });
});

describe('cancellationPenalty', () => {
  it('is 0 with no cancellations', () => {
    expect(cancellationPenalty(0, 10)).toBe(0);
  });

  it('is a rate, so long histories soften the odd cancel', () => {
    expect(cancellationPenalty(2, 98)).toBeCloseTo(0.02, 5);
    expect(cancellationPenalty(3, 3)).toBe(0.5);
  });

  it("uses at least 5 rides as the base, so one early cancel isn't fatal", () => {
    expect(cancellationPenalty(1, 0)).toBe(0.2);
  });
});

describe('complaintPenalty', () => {
  it('is a fifth per complaint, capped at 1', () => {
    expect(complaintPenalty(0)).toBe(0);
    expect(complaintPenalty(2)).toBe(0.4);
    expect(complaintPenalty(9)).toBe(1);
  });
});

describe('complaintWeight', () => {
  it('weighs an upheld report by its severity', () => {
    expect(complaintWeight(ReportStatus.REVIEWED, ReportSeverity.LOW)).toBe(1);
    expect(complaintWeight(ReportStatus.REVIEWED, ReportSeverity.MEDIUM)).toBe(
      2,
    );
    expect(complaintWeight(ReportStatus.REVIEWED, ReportSeverity.HIGH)).toBe(3);
  });

  it('counts an open report at the lowest weight', () => {
    expect(complaintWeight(ReportStatus.OPEN)).toBe(1);
  });

  it('ignores a dismissed report, whatever its severity', () => {
    expect(complaintWeight(ReportStatus.DISMISSED, ReportSeverity.HIGH)).toBe(
      0,
    );
  });

  it('counts an old reviewed report with no severity as 1', () => {
    expect(complaintWeight(ReportStatus.REVIEWED)).toBe(1);
  });
});

describe('TrustScoreService.calculate', () => {
  const service = new TrustScoreService();

  it('matches the worked example (85)', () => {
    const result = service.calculate(EXAMPLE);

    expect(result.score).toBe(85);
    expect(result.breakdown.completedRides).toBeCloseTo(15.25, 2);
    expect(result.breakdown.rating).toBeCloseTo(31.5, 5);
    expect(result.breakdown.cancellations).toBeCloseTo(1.36, 2);
  });

  it('gives a perfect profile 100', () => {
    const result = service.calculate({
      ...EXAMPLE,
      completedRides: 50,
      ratingCount: 20,
      averageRating: 5,
      cancellationCount: 0,
    });

    expect(result.score).toBe(100);
  });

  it('gives a new verified user a fair start (58)', () => {
    const result = service.calculate({
      ...NEW_USER,
      identityVerified: true,
      workplaceVerified: true,
    });

    expect(result.score).toBe(58);
  });

  it('keeps an unverified user low (18)', () => {
    expect(service.calculate(NEW_USER).score).toBe(18);
  });

  it('lowers the score for heavy cancellation history', () => {
    const result = service.calculate({ ...EXAMPLE, cancellationCount: 10 });

    expect(result.score).toBe(79);
    expect(result.breakdown.cancellations).toBe(7.5);
  });

  it('lowers the score more for complaints than for cancellations', () => {
    const result = service.calculate({
      ...EXAMPLE,
      cancellationCount: 0,
      complaintCount: 5,
    });

    expect(result.score).toBe(62);
    expect(result.breakdown.complaints).toBe(25);
  });

  it('takes 15 points for one high-severity complaint (70)', () => {
    const result = service.calculate({ ...EXAMPLE, complaintCount: 3 });

    expect(result.score).toBe(70);
    expect(result.breakdown.complaints).toBe(15);
  });

  it('never goes below 0', () => {
    const result = service.calculate({
      ...NEW_USER,
      ratingCount: 5,
      averageRating: 1,
      cancellationCount: 10,
      complaintCount: 9,
    });

    expect(result.score).toBe(0);
  });
});

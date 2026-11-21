// frontend report-category.enum.ts must match these
export enum ReportCategory {
  NO_SHOW = 'no_show',
  LATE_PICKUP = 'late_pickup',
  UNSAFE_DRIVING = 'unsafe_driving',
  INAPPROPRIATE_BEHAVIOUR = 'inappropriate_behaviour',
  OTHER = 'other',
}

// flagged "Safety" for admins (frontend utils/reports.ts has the same list)
export const SAFETY_REPORT_CATEGORIES: ReportCategory[] = [
  ReportCategory.UNSAFE_DRIVING,
  ReportCategory.INAPPROPRIATE_BEHAVIOUR,
];

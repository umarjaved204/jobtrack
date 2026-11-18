import type { ApplicationStatus, DateOnly } from './application';

/*
 * GET /analytics/* shapes. Mirror backend/app/schemas/analytics.py; the metric definitions
 * are in docs/architecture.md ("Dashboard metrics").
 */

/** A fraction in [0, 1], or null when there was nothing to divide by. */
export type Rate = number | null;

export type AnalyticsSummary = {
  /** Cohort applications that reached Applied or later. */
  applied: number;
  /** Cohort applications now in Applied, Screening, Interview or Offer. */
  active: number;
  interviewed: number;
  offers: number;
  interview_rate: Rate;
  offer_rate: Rate;
  /** On the wishlist now; ignores the range. */
  wishlist: number;
};

export type FunnelStage = {
  stage: Extract<ApplicationStatus, 'applied' | 'screening' | 'interview' | 'offer'>;
  count: number;
  rate_from_previous: Rate;
};
export type AnalyticsFunnel = { stages: FunnelStage[] };

export type SourceRow = {
  /** Most common spelling; null = no source recorded. */
  source: string | null;
  applied: number;
  interviewed: number;
  interview_rate: Rate;
};
export type AnalyticsSources = { sources: SourceRow[] };

export type TimeseriesPoint = { start: DateOnly; count: number };
export type AnalyticsTimeseries = { interval: 'week' | 'month'; points: TimeseriesPoint[] };

/** The cohort: applications with applied_on in [from, to]; either end may be open. */
export type AnalyticsPeriod = { from?: DateOnly; to?: DateOnly };

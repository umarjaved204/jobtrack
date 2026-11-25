import { parseISO } from 'date-fns/parseISO';

import { parseDateOnly } from '@/lib/dates';
import type { Application, ApplicationEvent, ApplicationStatus } from '@/types/application';

/*
 * The detail page's stage track: which pipeline stages an application reached and when.
 * Same rule as the dashboard (docs/architecture.md "Stages reached"): the furthest stage
 * comes from the timeline plus the current status, and reaching a stage counts every
 * stage before it (a move from Applied straight to Interview reached Screening too, on
 * the day of that move). Rejected and Withdrawn are outcomes, not stages.
 */

export const TRACK_STAGES = ['applied', 'screening', 'interview', 'offer'] as const;
export type TrackStage = (typeof TRACK_STAGES)[number];

const RANK: Partial<Record<ApplicationStatus, number>> = {
  applied: 1,
  screening: 2,
  interview: 3,
  offer: 4,
};

export type StageStep = {
  stage: TrackStage;
  reached: boolean;
  /** When it was first reached (or passed), if known. */
  on: Date | null;
  /** The application's current status. */
  current: boolean;
};

export type StageOutcome = { status: 'rejected' | 'withdrawn'; on: Date | null };

export function stageTrack(
  application: Pick<Application, 'status' | 'applied_on'>,
  /** Any order; the API sends newest first. */
  events: ApplicationEvent[],
): { steps: StageStep[]; outcome: StageOutcome | null } {
  const moves = events
    .filter((e) => e.type === 'status_change' && e.to_status !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const furthest = Math.max(
    RANK[application.status] ?? 0,
    ...moves.map((e) => (e.to_status ? (RANK[e.to_status] ?? 0) : 0)),
  );

  const steps = TRACK_STAGES.map((stage, i): StageStep => {
    const rank = i + 1;
    const first = moves.find((e) => e.to_status && (RANK[e.to_status] ?? 0) >= rank);
    const on =
      stage === 'applied' && application.applied_on
        ? parseDateOnly(application.applied_on)
        : first
          ? parseISO(first.created_at)
          : null;
    return {
      stage,
      reached: furthest >= rank,
      on: furthest >= rank ? on : null,
      current: application.status === stage,
    };
  });

  let outcome: StageOutcome | null = null;
  if (application.status === 'rejected' || application.status === 'withdrawn') {
    const exit = moves.findLast((e) => e.to_status === application.status);
    outcome = { status: application.status, on: exit ? parseISO(exit.created_at) : null };
  }
  return { steps, outcome };
}

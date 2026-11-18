import { daysUntil, parseDateOnly } from '@/lib/dates';
import type { Application, Board, DateOnly } from '@/types/application';

/*
 * "Coming up": apply-by dates (deadline_on) of roles still on the wishlist, worked out in
 * the browser against its own calendar day (`today`), never the server's UTC date. Once
 * you've applied, the apply-by date needs no action, so other stages are left out.
 * Assessment and interview dates join in Phase 8, from calendar events.
 */

/** How far ahead to look: today plus the next 13 days. */
export const LOOKAHEAD_DAYS = 14;
/** Apply-by dates missed longer ago than this are only counted ("+N older"), not listed. */
export const OVERDUE_DAYS = 30;

export type Deadline = { application: Application; deadline: DateOnly; days: number };

export type ComingUp = {
  /** Apply-by dates missed in the last OVERDUE_DAYS days, oldest first. */
  overdue: Deadline[];
  /** How many were missed longer ago than that. */
  olderOverdue: number;
  /** Due today through today + LOOKAHEAD_DAYS - 1, soonest first. */
  upcoming: Deadline[];
};

export function comingUp(board: Board, today: DateOnly): ComingUp {
  const now = parseDateOnly(today); // local midnight of the browser's calendar day
  const deadlines: Deadline[] = board.columns
    .flatMap((column) => column.applications)
    .filter((a) => a.status === 'wishlist' && a.deadline_on !== null)
    .map((application) => {
      const deadline = application.deadline_on as DateOnly;
      return { application, deadline, days: daysUntil(deadline, now) };
    })
    .sort((a, b) => a.days - b.days || a.application.company.localeCompare(b.application.company));

  const overdue = deadlines.filter((d) => d.days < 0);
  return {
    overdue: overdue.filter((d) => d.days >= -OVERDUE_DAYS),
    olderOverdue: overdue.filter((d) => d.days < -OVERDUE_DAYS).length,
    upcoming: deadlines.filter((d) => d.days >= 0 && d.days < LOOKAHEAD_DAYS),
  };
}

/** "Today", "Tomorrow", "In 5 days", "Yesterday", "3 days ago". */
export function relativeDue(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  if (days === -1) return 'Yesterday';
  return `${-days} days ago`;
}

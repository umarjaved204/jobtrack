import { daysUntil, parseDateOnly } from '@/lib/dates';
import type { Application, ApplicationStatus, Board, DateOnly } from '@/types/application';

/*
 * "Coming up": application deadlines, worked out in the browser against its own calendar
 * day (`today`), never the server's UTC date. Only applications still worth acting on
 * count: the wishlist and the active stages, not rejected or withdrawn ones.
 */

/** How far ahead to look: today plus the next 13 days. */
export const LOOKAHEAD_DAYS = 14;

const OPEN: ReadonlySet<ApplicationStatus> = new Set([
  'wishlist',
  'applied',
  'screening',
  'interview',
  'offer',
]);

export type Deadline = { application: Application; deadline: DateOnly; days: number };

export type ComingUp = {
  /** Past deadlines, oldest first. */
  overdue: Deadline[];
  /** Due today through today + LOOKAHEAD_DAYS - 1, soonest first. */
  upcoming: Deadline[];
};

export function comingUp(board: Board, today: DateOnly): ComingUp {
  const now = parseDateOnly(today); // local midnight of the browser's calendar day
  const deadlines: Deadline[] = board.columns
    .flatMap((column) => column.applications)
    .filter((a) => OPEN.has(a.status) && a.deadline_on !== null)
    .map((application) => {
      const deadline = application.deadline_on as DateOnly;
      return { application, deadline, days: daysUntil(deadline, now) };
    })
    .sort((a, b) => a.days - b.days || a.application.company.localeCompare(b.application.company));

  return {
    overdue: deadlines.filter((d) => d.days < 0),
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

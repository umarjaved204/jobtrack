import { dueDay, dueState, localDay, type Zone } from '@/features/reminders/due';
import { daysUntil, parseDateOnly } from '@/lib/dates';
import type { Application, Board, DateOnly } from '@/types/application';
import type { CalendarItem, EventItem } from '@/types/calendar';
import type { Reminder } from '@/types/reminder';

/*
 * "Coming up": what needs attention soon, worked out in the browser against its own
 * calendar day (`today`) and clock (`now`), never the server's UTC date. Definitions are
 * in docs/architecture.md ("Dashboard metrics"); change them there and in the tests.
 *
 * - Apply-by dates of roles still on the wishlist (once applied, the date needs no action).
 * - Open follow-up reminders: overdue ones (an all-day reminder from the next local day, a
 *   timed one once its time has passed) and those due in the window.
 * - Interviews, assessments and deadline events in the window that haven't ended yet. An
 *   event that has started but not ended (a take-home window) shows today. Events are never
 *   "overdue": they just happen. "Other" events (coffee chats) aren't included.
 */

/** How far ahead to look: today plus the next 13 days. */
export const LOOKAHEAD_DAYS = 14;
/** Missed items older than this are only counted ("+N older"), not listed. */
export const OVERDUE_DAYS = 30;

const EVENT_KINDS: ReadonlySet<EventItem['kind']> = new Set([
  'interview',
  'assessment',
  'deadline',
]);

type Common = {
  key: string;
  title: string;
  /** The local day it's listed under. */
  day: DateOnly;
  /** Calendar days from today to `day` (negative = past). */
  days: number;
  /** Instant for timed entries (sort order within a day); null for all-day ones. */
  at: string | null;
};
export type Entry = Common &
  (
    | { kind: 'apply_by'; application: Application }
    | { kind: 'event'; event: EventItem }
    | { kind: 'reminder'; reminder: Reminder }
  );

export type ComingUpSources = {
  board: Board;
  /** Open reminders (any due date: overdue ones may be long past). */
  reminders?: Reminder[];
  /** Calendar feed items for today through the look-ahead window (only events are used). */
  feed?: CalendarItem[];
};

export type ComingUp = {
  /** Missed apply-by dates and overdue reminders from the last OVERDUE_DAYS days, oldest first. */
  overdue: Entry[];
  /** How many were missed longer ago than that. */
  olderOverdue: number;
  /** Today through today + LOOKAHEAD_DAYS - 1, soonest first; all-day before timed. */
  upcoming: Entry[];
};

function compareEntries(a: Entry, b: Entry): number {
  if (a.day !== b.day) return a.day.localeCompare(b.day);
  if ((a.at === null) !== (b.at === null)) return a.at === null ? -1 : 1;
  return (a.at ?? '').localeCompare(b.at ?? '') || a.title.localeCompare(b.title);
}

export function comingUp(
  { board, reminders = [], feed = [] }: ComingUpSources,
  today: DateOnly,
  now: Date = new Date(),
  zone?: Zone,
): ComingUp {
  const midnight = parseDateOnly(today); // local midnight of the browser's calendar day
  const daysTo = (day: DateOnly) => daysUntil(day, midnight);
  const overdue: Entry[] = [];
  const later: Entry[] = [];

  for (const application of board.columns.flatMap((column) => column.applications)) {
    if (application.status !== 'wishlist' || application.deadline_on === null) continue;
    const day = application.deadline_on;
    const entry: Entry = {
      kind: 'apply_by',
      key: `apply-${application.id}`,
      title: application.company,
      day,
      days: daysTo(day),
      at: null,
      application,
    };
    (entry.days < 0 ? overdue : later).push(entry);
  }

  for (const reminder of reminders) {
    const state = dueState(reminder, now, zone);
    if (state === 'done') continue;
    const day = dueDay(reminder, zone);
    const entry: Entry = {
      kind: 'reminder',
      key: `reminder-${reminder.id}`,
      title: reminder.title,
      day,
      days: daysTo(day),
      at: reminder.due_at,
      reminder,
    };
    (state === 'overdue' ? overdue : later).push(entry);
  }

  for (const item of feed) {
    if (item.type !== 'event' || !EVENT_KINDS.has(item.kind)) continue;
    if (Date.parse(item.ends_at ?? item.starts_at) <= now.getTime()) continue; // over
    const startDay = localDay(item.starts_at, zone);
    const day = startDay < today ? today : startDay; // running now: list it today
    later.push({
      kind: 'event',
      key: `event-${item.id}`,
      title: item.title,
      day,
      days: daysTo(day),
      at: startDay < today ? null : item.starts_at,
      event: item,
    });
  }

  overdue.sort(compareEntries);
  return {
    overdue: overdue.filter((e) => e.days >= -OVERDUE_DAYS),
    olderOverdue: overdue.filter((e) => e.days < -OVERDUE_DAYS).length,
    upcoming: later.filter((e) => e.days >= 0 && e.days < LOOKAHEAD_DAYS).sort(compareEntries),
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

import { tz, TZDate } from '@date-fns/tz';
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays';
import { format } from 'date-fns/format';

import { parseDateOnly } from '@/lib/dates';
import type { DateOnly } from '@/types/application';
import type { Reminder } from '@/types/reminder';

/*
 * When reminders are due, in the user's own time zone (the browser's). All-day reminders
 * are plain dates: due on that calendar day, overdue from the next one, never converted
 * through UTC. Timed reminders are instants: overdue once that moment has passed, and on
 * the local day they fall on.
 *
 * Every function takes an optional IANA `zone`: unset means the browser's zone (the app);
 * tests pass one explicitly (date-fns `in` + @date-fns/tz), so daylight-saving and
 * negative-offset cases are checked whatever zone the machine running them is in.
 */

export type Zone = string | undefined;

const inZone = (zone: Zone) => (zone ? { in: tz(zone) } : {});

/** The local calendar day of an instant, "YYYY-MM-DD". */
export function localDay(instant: Date | string | number, zone?: Zone): DateOnly {
  return format(new Date(instant), 'yyyy-MM-dd', inZone(zone));
}

/** The local wall-clock time of an instant, "HH:mm". */
export function localTime(instant: Date | string | number, zone?: Zone): string {
  return format(new Date(instant), 'HH:mm', inZone(zone));
}

/** A local date and wall-clock time → an ISO instant in UTC. DST is handled by the zone
 * rules: a time skipped by "spring forward" moves to the next valid time. */
export function toInstant(date: DateOnly, time: string, zone?: Zone): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, min] = time.split(':').map(Number) as [number, number];
  const local = zone ? new TZDate(y, m - 1, d, h, min, zone) : new Date(y, m - 1, d, h, min);
  return new Date(local.getTime()).toISOString();
}

export type DueState = 'done' | 'overdue' | 'today' | 'upcoming';

export function dueState(reminder: Reminder, now: Date, zone?: Zone): DueState {
  if (reminder.done_at) return 'done';
  const today = localDay(now, zone);
  if (reminder.due_on !== null) {
    if (reminder.due_on < today) return 'overdue';
    return reminder.due_on === today ? 'today' : 'upcoming';
  }
  const due = new Date(reminder.due_at ?? 0);
  if (due <= now) return 'overdue';
  return localDay(due, zone) === today ? 'today' : 'upcoming';
}

/** The local day a reminder is due on. */
export function dueDay(reminder: Reminder, zone?: Zone): DateOnly {
  return reminder.due_on ?? localDay(reminder.due_at ?? 0, zone);
}

/** Calendar days from today to the due day (negative = past). */
export function daysFromToday(reminder: Reminder, now: Date, zone?: Zone): number {
  return differenceInCalendarDays(
    parseDateOnly(dueDay(reminder, zone)),
    parseDateOnly(localDay(now, zone)),
  );
}

/**
 * "Today", "Tomorrow at 14:00", "Yesterday", "Fri 20 Nov", "Mon 3 Aug 2026 at 09:30":
 * near days by name, others by date (with the year only when it isn't this year).
 */
export function dueLabel(reminder: Reminder, now: Date, zone?: Zone): string {
  const day = dueDay(reminder, zone);
  const diff = daysFromToday(reminder, now, zone);
  const named = { [-1]: 'Yesterday', 0: 'Today', 1: 'Tomorrow' }[diff];
  const sameYear = day.slice(0, 4) === localDay(now, zone).slice(0, 4);
  const dayText = named ?? format(parseDateOnly(day), sameYear ? 'EEE d MMM' : 'EEE d MMM yyyy');
  return reminder.due_at ? `${dayText} at ${localTime(reminder.due_at, zone)}` : dayText;
}

/** Due order in local time: by day, all-day before timed on the same day, then by time. */
export function compareDue(a: Reminder, b: Reminder, zone?: Zone): number {
  const byDay = dueDay(a, zone).localeCompare(dueDay(b, zone));
  if (byDay) return byDay;
  if (!a.due_at || !b.due_at) return (a.due_at ? 1 : 0) - (b.due_at ? 1 : 0);
  return a.due_at.localeCompare(b.due_at) || a.title.localeCompare(b.title);
}

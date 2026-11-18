import { tz, TZDate } from '@date-fns/tz';
import { addDays } from 'date-fns/addDays';
import { addMonths } from 'date-fns/addMonths';
import { endOfMonth } from 'date-fns/endOfMonth';
import { endOfWeek } from 'date-fns/endOfWeek';
import { format } from 'date-fns/format';
import { startOfWeek } from 'date-fns/startOfWeek';

import { localDay, localTime, type Zone } from '@/features/reminders/due';
import { isDateOnly, parseDateOnly, toDateOnly } from '@/lib/dates';
import type { DateOnly } from '@/types/application';
import type { CalendarItem, ReminderItem } from '@/types/calendar';
import type { Reminder } from '@/types/reminder';

/*
 * The month view's maths, in the user's zone (the browser's; tests pass one). Weeks start
 * on Monday, like the dashboard's ISO weeks. Calendar days are "YYYY-MM-DD" strings, and
 * day arithmetic is done on local dates, so it follows the calendar across DST changes.
 */

/** "2026-11". */
export type Month = string;

const WEEK = { weekStartsOn: 1 } as const;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseMonth(value: string | null, today: DateOnly): Month {
  return value && MONTH.test(value) ? value : today.slice(0, 7);
}

export const firstDay = (month: Month): DateOnly => `${month}-01`;

export function shiftMonth(month: Month, by: number): Month {
  return toDateOnly(addMonths(parseDateOnly(firstDay(month)), by)).slice(0, 7);
}

/** "November 2026". */
export const monthLabel = (month: Month) => format(parseDateOnly(firstDay(month)), 'MMMM yyyy');

/** The grid: whole Monday-to-Sunday weeks covering the month (4 to 6 of them). */
export function monthWeeks(month: Month): DateOnly[][] {
  const first = parseDateOnly(firstDay(month));
  const last = endOfWeek(endOfMonth(first), WEEK);
  const weeks: DateOnly[][] = [];
  for (let day = startOfWeek(first, WEEK); day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => toDateOnly(addDays(day, i))));
  }
  return weeks;
}

/** Local midnight at the start of `day`, as an instant with its UTC offset. */
function localMidnight(day: DateOnly, zone?: Zone): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = zone ? new TZDate(y, m - 1, d, zone) : new Date(y, m - 1, d);
  return format(date, "yyyy-MM-dd'T'HH:mm:ssXXX", zone ? { in: tz(zone) } : {});
}

/**
 * The feed request for a run of days: [first day 00:00, the day after the last 00:00),
 * each end with its own offset (they differ when DST changes in between). The server reads
 * date-only items against these local days, so nothing date-only goes through UTC.
 */
export function feedRange(first: DateOnly, last: DateOnly, zone?: Zone) {
  return {
    from: localMidnight(first, zone),
    to: localMidnight(toDateOnly(addDays(parseDateOnly(last), 1)), zone),
  };
}

const MAX_SPAN_DAYS = 62;

/** The local days an item shows on. Events show on every day they overlap; one that
 * ends exactly at midnight doesn't spill into the next day. */
export function itemDays(item: CalendarItem, zone?: Zone): DateOnly[] {
  if (item.type === 'apply_by') return [item.date];
  if (item.type === 'reminder') return [item.date ?? localDay(item.starts_at ?? 0, zone)];
  const start = localDay(item.starts_at, zone);
  const end = item.ends_at
    ? localDay(Math.max(Date.parse(item.starts_at), Date.parse(item.ends_at) - 1), zone)
    : start;
  const days = [start];
  for (let day = start; day < end && days.length < MAX_SPAN_DAYS;) {
    day = toDateOnly(addDays(parseDateOnly(day), 1));
    days.push(day);
  }
  return days;
}

/** Date-only items first, then by start time, then title. */
function compareItems(a: CalendarItem, b: CalendarItem): number {
  const start = (item: CalendarItem) => (item.type === 'apply_by' ? null : item.starts_at);
  const [x, y] = [start(a), start(b)];
  if (x === null || y === null) {
    if (x !== y) return x === null ? -1 : 1;
  } else if (x !== y) {
    return x.localeCompare(y);
  }
  return a.title.localeCompare(b.title);
}

/** Items grouped by the local days they show on, each day in display order. */
export function itemsByDay(items: CalendarItem[], zone?: Zone): Map<DateOnly, CalendarItem[]> {
  const byDay = new Map<DateOnly, CalendarItem[]>();
  for (const item of items) {
    for (const day of itemDays(item, zone)) {
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }
  }
  for (const list of byDay.values()) list.sort(compareItems);
  return byDay;
}

/** Grid keyboard moves (WAI-ARIA APG date grid): the day focus moves to, or null. */
export function moveFocus(day: DateOnly, key: string): DateOnly | null {
  const date = parseDateOnly(day);
  const moves: Record<string, () => Date> = {
    ArrowLeft: () => addDays(date, -1),
    ArrowRight: () => addDays(date, 1),
    ArrowUp: () => addDays(date, -7),
    ArrowDown: () => addDays(date, 7),
    Home: () => startOfWeek(date, WEEK),
    End: () => endOfWeek(date, WEEK),
    PageUp: () => addMonths(date, -1), // 31 March → 28/29 February
    PageDown: () => addMonths(date, 1),
  };
  const move = moves[key];
  return move ? toDateOnly(move()) : null;
}

/** "14:00–15:30", "From 09:00", "09:00, Mon 16 Nov to 17:00, Fri 20 Nov", "All day". */
export function itemTimeText(item: CalendarItem, zone?: Zone): string {
  if (item.type === 'apply_by' || (item.type === 'reminder' && !item.starts_at)) {
    return 'All day';
  }
  const start = item.starts_at ?? '';
  const end = item.type === 'event' ? item.ends_at : null;
  if (!end || end === start) return localTime(start, zone);
  const [startDay, endDay] = [localDay(start, zone), localDay(end, zone)];
  if (startDay === endDay) return `${localTime(start, zone)}–${localTime(end, zone)}`;
  const day = (d: DateOnly) => format(parseDateOnly(d), 'EEE d MMM');
  return `${localTime(start, zone)}, ${day(startDay)} to ${localTime(end, zone)}, ${day(endDay)}`;
}

/** "Thursday 19 November 2026". */
export const dayHeading = (day: DateOnly) => format(parseDateOnly(day), 'EEEE d MMMM yyyy');

export const isDay = (value: string | null): value is DateOnly => isDateOnly(value);

/** A feed reminder as the reminder shape the follow-up row and dialogs use. */
export function asReminder(item: ReminderItem): Reminder {
  return {
    id: item.id,
    title: item.title,
    application: item.application,
    due_on: item.date,
    due_at: item.starts_at,
    done_at: item.done_at,
  };
}

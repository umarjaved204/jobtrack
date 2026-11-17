import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

import type { DateOnly } from '@/types/application';

/*
 * Calendar dates (applied_on, deadline_on) travel as "YYYY-MM-DD" strings and stay strings
 * in app state. Never parse them with `new Date("YYYY-MM-DD")`: the spec reads a date-only
 * string as UTC midnight, so anywhere west of UTC it becomes the *previous* day.
 * `parseISO` reads it as local midnight, which is the calendar day the user meant.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: unknown): value is DateOnly {
  return typeof value === 'string' && DATE_ONLY.test(value) && isValid(parseISO(value));
}

/** "2026-11-17" → local Date at 00:00 on 17 Nov. Throws on anything else (programming error). */
export function parseDateOnly(value: DateOnly): Date {
  if (!isDateOnly(value)) throw new RangeError(`Not a YYYY-MM-DD date: ${value}`);
  return parseISO(value);
}

/** Local calendar day of `date` as "YYYY-MM-DD" (not toISOString(), which is UTC). */
export function toDateOnly(date: Date): DateOnly {
  return format(date, 'yyyy-MM-dd');
}

export function todayDateOnly(now: Date = new Date()): DateOnly {
  return toDateOnly(now);
}

/** "17 Nov 2026" (or a custom date-fns pattern). */
export function formatDateOnly(value: DateOnly, pattern = 'd MMM yyyy'): string {
  return format(parseDateOnly(value), pattern);
}

/** Whole calendar days from today to `value` (negative = in the past). */
export function daysUntil(value: DateOnly, now: Date = new Date()): number {
  return differenceInCalendarDays(parseDateOnly(value), now);
}

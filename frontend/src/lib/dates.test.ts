import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  daysUntil,
  formatDateOnly,
  isDateOnly,
  parseDateOnly,
  toDateOnly,
  todayDateOnly,
} from './dates';

/*
 * Runs west of UTC, where `new Date("YYYY-MM-DD")` shows the previous day. Node re-reads
 * process.env.TZ when it changes, so this only affects this file (Vitest isolates files).
 */
const ORIGINAL_TZ = process.env['TZ'];
beforeAll(() => {
  process.env['TZ'] = 'America/Los_Angeles'; // UTC-8 in November
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

describe('date-only handling in a negative UTC offset', () => {
  it('really is running west of UTC (and shows the bug we avoid)', () => {
    expect(new Date(2026, 10, 17).getTimezoneOffset()).toBe(480);
    // The trap: the spec parses date-only strings as UTC midnight → 16 Nov locally.
    // eslint-disable-next-line no-restricted-syntax -- demonstrating the bug on purpose
    expect(new Date('2026-11-17').getDate()).toBe(16);
  });

  it('parses "YYYY-MM-DD" as that local calendar day', () => {
    const date = parseDateOnly('2026-11-17');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 10, 17, 0,
    ]);
  });

  it('formats and round-trips without shifting a day', () => {
    expect(formatDateOnly('2026-11-17')).toBe('17 Nov 2026');
    expect(formatDateOnly('2026-01-01')).toBe('1 Jan 2026');
    expect(toDateOnly(parseDateOnly('2026-11-17'))).toBe('2026-11-17');
  });

  it('uses the local day for "today", even late in the evening', () => {
    // 23:30 local on 17 Nov is already 18 Nov in UTC.
    const lateEvening = new Date(2026, 10, 17, 23, 30);
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-11-18');
    expect(todayDateOnly(lateEvening)).toBe('2026-11-17');
  });

  it('counts calendar days to a deadline', () => {
    const now = new Date(2026, 10, 17, 23, 30);
    expect(daysUntil('2026-11-17', now)).toBe(0);
    expect(daysUntil('2026-11-18', now)).toBe(1);
    expect(daysUntil('2026-11-10', now)).toBe(-7);
  });
});

describe('isDateOnly / parseDateOnly', () => {
  it.each(['2026-11-17', '2024-02-29'])('accepts %s', (value) => {
    expect(isDateOnly(value)).toBe(true);
  });

  it.each(['2026-11-17T00:00:00Z', '17/11/2026', '2026-13-01', '2025-02-29', '', null])(
    'rejects %j',
    (value) => {
      expect(isDateOnly(value)).toBe(false);
    },
  );

  it('throws on invalid input instead of producing "Invalid Date"', () => {
    expect(() => parseDateOnly('2026-13-01')).toThrow(RangeError);
  });
});

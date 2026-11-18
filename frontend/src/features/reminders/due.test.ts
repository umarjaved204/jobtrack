import { describe, expect, it } from 'vitest';

import type { Reminder } from '@/types/reminder';

import { compareDue, dueLabel, dueState, localDay, localTime, toInstant } from './due';

/*
 * Zones are explicit, so these pass on any machine. America/Chicago: CST -06:00, CDT
 * -05:00; clocks jump 02:00 → 03:00 on 14 March 2027 and fall back on 7 November 2027.
 * Asia/Karachi: +05:00 all year.
 */
const CHICAGO = 'America/Chicago';
const KARACHI = 'Asia/Karachi';

const reminder = (fields: Partial<Reminder>): Reminder => ({
  id: 'r1',
  title: 'Follow up',
  application: null,
  due_on: null,
  due_at: null,
  done_at: null,
  ...fields,
});

describe('toInstant / localDay / localTime', () => {
  it('turns a local date and time into UTC, across a DST change', () => {
    expect(toInstant('2027-03-13', '09:00', CHICAGO)).toBe('2027-03-13T15:00:00.000Z'); // CST
    expect(toInstant('2027-03-14', '09:00', CHICAGO)).toBe('2027-03-14T14:00:00.000Z'); // CDT
    expect(toInstant('2026-11-20', '09:00', KARACHI)).toBe('2026-11-20T04:00:00.000Z');
  });

  it('moves a time skipped by "spring forward" to a real time', () => {
    // 02:30 doesn't exist in Chicago on 14 March 2027.
    expect(localTime(toInstant('2027-03-14', '02:30', CHICAGO), CHICAGO)).toBe('03:30');
  });

  it('reads the local day and time back out of an instant', () => {
    // 04:30 UTC on the 15th is 23:30 CDT on the 14th in Chicago, 09:30 on the 15th in Karachi.
    expect(localDay('2027-03-15T04:30:00Z', CHICAGO)).toBe('2027-03-14');
    expect(localTime('2027-03-15T04:30:00Z', CHICAGO)).toBe('23:30');
    expect(localDay('2027-03-15T04:30:00Z', KARACHI)).toBe('2027-03-15');
  });
});

describe('dueState', () => {
  const now = new Date('2026-11-20T18:00:00Z'); // 12:00 in Chicago, 23:00 in Karachi

  it('all-day: due on its date, overdue from the next local day', () => {
    expect(dueState(reminder({ due_on: '2026-11-19' }), now, CHICAGO)).toBe('overdue');
    expect(dueState(reminder({ due_on: '2026-11-20' }), now, CHICAGO)).toBe('today');
    expect(dueState(reminder({ due_on: '2026-11-21' }), now, CHICAGO)).toBe('upcoming');
  });

  it('all-day dates never shift with the zone: only "today" does', () => {
    // At 03:00 UTC on the 21st it is still the 20th in Chicago but already the 21st in Karachi.
    const late = new Date('2026-11-21T03:00:00Z');
    expect(dueState(reminder({ due_on: '2026-11-20' }), late, CHICAGO)).toBe('today');
    expect(dueState(reminder({ due_on: '2026-11-20' }), late, KARACHI)).toBe('overdue');
  });

  it('timed: overdue once the moment has passed, else today or upcoming by local day', () => {
    expect(dueState(reminder({ due_at: '2026-11-20T17:59:00Z' }), now, CHICAGO)).toBe('overdue');
    expect(dueState(reminder({ due_at: '2026-11-20T18:00:00Z' }), now, CHICAGO)).toBe('overdue');
    // 23:30 Chicago time today (05:30 UTC tomorrow) is still "today" there.
    expect(dueState(reminder({ due_at: '2026-11-21T05:30:00Z' }), now, CHICAGO)).toBe('today');
    // ...but already tomorrow in Karachi.
    expect(dueState(reminder({ due_at: '2026-11-21T05:30:00Z' }), now, KARACHI)).toBe('upcoming');
  });

  it('done wins over everything', () => {
    const done = reminder({ due_on: '2026-11-01', done_at: '2026-11-02T10:00:00Z' });
    expect(dueState(done, now, CHICAGO)).toBe('done');
  });
});

describe('dueLabel', () => {
  const now = new Date('2026-11-20T18:00:00Z'); // Friday 20 Nov, 12:00 in Chicago

  it('names near days and dates the rest, with the time for timed reminders', () => {
    expect(dueLabel(reminder({ due_on: '2026-11-20' }), now, CHICAGO)).toBe('Today');
    expect(dueLabel(reminder({ due_on: '2026-11-19' }), now, CHICAGO)).toBe('Yesterday');
    expect(dueLabel(reminder({ due_at: '2026-11-21T20:00:00Z' }), now, CHICAGO)).toBe(
      'Tomorrow at 14:00',
    );
    expect(dueLabel(reminder({ due_on: '2026-11-27' }), now, CHICAGO)).toBe('Fri 27 Nov');
    expect(dueLabel(reminder({ due_on: '2027-01-04' }), now, CHICAGO)).toBe('Mon 4 Jan 2027');
  });

  it('labels the same instant by each zone’s own clock', () => {
    const at = reminder({ due_at: '2026-11-21T03:00:00Z' });
    expect(dueLabel(at, now, CHICAGO)).toBe('Today at 21:00');
    expect(dueLabel(at, now, KARACHI)).toBe('Tomorrow at 08:00');
  });

  it('counts days across a DST change by the calendar, not by 24-hour blocks', () => {
    const saturday = new Date('2027-03-13T18:00:00Z'); // noon CST, the day before the jump
    expect(dueLabel(reminder({ due_on: '2027-03-14' }), saturday, CHICAGO)).toBe('Tomorrow');
    expect(dueLabel(reminder({ due_on: '2027-03-15' }), saturday, CHICAGO)).toBe('Mon 15 Mar');
  });
});

describe('compareDue', () => {
  it('orders by local day, all-day first, then time', () => {
    const items = [
      reminder({ id: 'late', title: 'Late call', due_at: '2026-11-21T04:00:00Z' }), // 22:00 on the 20th, Chicago
      reminder({ id: 'tomorrow', title: 'Tomorrow', due_on: '2026-11-21' }),
      reminder({ id: 'morning', title: 'Morning', due_at: '2026-11-20T15:00:00Z' }), // 09:00
      reminder({ id: 'allday', title: 'All day', due_on: '2026-11-20' }),
    ];
    expect([...items].sort((a, b) => compareDue(a, b, CHICAGO)).map((r) => r.id)).toEqual([
      'allday',
      'morning',
      'late',
      'tomorrow',
    ]);
    // In Karachi the "late call" is on the 21st (09:00), after that day's all-day item.
    expect([...items].sort((a, b) => compareDue(a, b, KARACHI)).map((r) => r.id)).toEqual([
      'allday',
      'morning',
      'tomorrow',
      'late',
    ]);
  });
});

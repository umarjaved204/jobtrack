import { describe, expect, it } from 'vitest';

import type { CalendarItem, EventItem } from '@/types/calendar';

import {
  feedRange,
  itemDays,
  itemsByDay,
  itemTimeText,
  monthLabel,
  monthWeeks,
  moveFocus,
  parseMonth,
  shiftMonth,
} from './month';

const CHICAGO = 'America/Chicago'; // CST -06:00, CDT -05:00 from 14 March 2027
const KARACHI = 'Asia/Karachi'; // +05:00

const event = (fields: Partial<EventItem>): EventItem => ({
  type: 'event',
  id: 'e1',
  kind: 'interview',
  title: 'Interview',
  starts_at: '2026-11-20T15:00:00Z',
  ends_at: null,
  location_or_link: null,
  application: null,
  ...fields,
});

describe('months', () => {
  it('reads ?month, falling back to this month', () => {
    expect(parseMonth('2027-03', '2026-11-19')).toBe('2027-03');
    expect(parseMonth('2027-13', '2026-11-19')).toBe('2026-11');
    expect(parseMonth(null, '2026-11-19')).toBe('2026-11');
  });

  it('steps across years and labels the month', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2026-11')).toBe('November 2026');
  });

  it('builds whole Monday-to-Sunday weeks around the month', () => {
    const weeks = monthWeeks('2026-11'); // 1 November 2026 is a Sunday
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]).toBe('2026-10-26');
    expect(weeks[0]?.[6]).toBe('2026-11-01');
    expect(weeks.at(-1)?.[6]).toBe('2026-12-06');
    expect(monthWeeks('2021-02')).toHaveLength(4); // Mon 1 to Sun 28 February 2021
  });
});

describe('feedRange', () => {
  it('asks for local midnights, each with its own offset across a DST change', () => {
    expect(feedRange('2027-03-01', '2027-03-31', CHICAGO)).toEqual({
      from: '2027-03-01T00:00:00-06:00',
      to: '2027-04-01T00:00:00-05:00',
    });
    expect(feedRange('2026-11-20', '2026-11-20', KARACHI)).toEqual({
      from: '2026-11-20T00:00:00+05:00',
      to: '2026-11-21T00:00:00+05:00',
    });
  });
});

describe('itemDays / itemsByDay', () => {
  it('puts date-only items on their date, in any zone', () => {
    const applyBy: CalendarItem = {
      type: 'apply_by',
      id: 'a1',
      title: 'Apply to Wise',
      date: '2026-11-20',
      application: { id: 'a1', company: 'Wise', role_title: 'Engineer' },
    };
    expect(itemDays(applyBy, CHICAGO)).toEqual(['2026-11-20']);
    expect(itemDays(applyBy, KARACHI)).toEqual(['2026-11-20']);
  });

  it('puts timed items on the local day they happen', () => {
    // 04:30 UTC on the 15th: 23:30 on the 14th in Chicago.
    const late = event({ starts_at: '2027-03-15T04:30:00Z' });
    expect(itemDays(late, CHICAGO)).toEqual(['2027-03-14']);
    expect(itemDays(late, KARACHI)).toEqual(['2027-03-15']);
  });

  it('spreads events over every day they overlap, but not past a midnight end', () => {
    const overnight = event({ starts_at: '2026-11-20T22:00:00Z', ends_at: '2026-11-21T02:00:00Z' });
    const toMidnight = event({ starts_at: '2026-11-20T22:00:00Z', ends_at: '2026-11-21T00:00:00Z' });
    const window = event({ starts_at: '2026-11-16T09:00:00Z', ends_at: '2026-11-19T17:00:00Z' });
    expect(itemDays(overnight, 'UTC')).toEqual(['2026-11-20', '2026-11-21']);
    expect(itemDays(toMidnight, 'UTC')).toEqual(['2026-11-20']);
    expect(itemDays(window, 'UTC')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
  }); // prettier-ignore

  it('orders each day: date-only first, then by time', () => {
    const items: CalendarItem[] = [
      event({ id: 'late', title: 'Late', starts_at: '2026-11-20T18:00:00Z' }),
      event({ id: 'early', title: 'Early', starts_at: '2026-11-20T09:00:00Z' }),
      { type: 'reminder', id: 'r', title: 'All-day reminder', date: '2026-11-20', starts_at: null, done_at: null, application: null },
    ]; // prettier-ignore
    expect(
      itemsByDay(items, 'UTC')
        .get('2026-11-20')
        ?.map((i) => i.id),
    ).toEqual(['r', 'early', 'late']);
  });
});

describe('moveFocus (APG date grid keys)', () => {
  it.each([
    ['ArrowLeft', '2026-11-18'],
    ['ArrowRight', '2026-11-20'],
    ['ArrowUp', '2026-11-12'],
    ['ArrowDown', '2026-11-26'],
    ['Home', '2026-11-16'], // Monday
    ['End', '2026-11-22'], // Sunday
    ['PageUp', '2026-10-19'],
    ['PageDown', '2026-12-19'],
  ])('%s from Thu 19 Nov 2026 goes to %s', (key, expected) => {
    expect(moveFocus('2026-11-19', key)).toBe(expected);
  });

  it('clamps month moves to the last day, and ignores other keys', () => {
    expect(moveFocus('2027-03-31', 'PageUp')).toBe('2027-02-28');
    expect(moveFocus('2026-11-19', 'a')).toBeNull();
  });

  it('moves by calendar days across a DST change', () => {
    expect(moveFocus('2027-03-13', 'ArrowRight')).toBe('2027-03-14');
    expect(moveFocus('2027-03-14', 'ArrowRight')).toBe('2027-03-15');
  });
});

describe('itemTimeText', () => {
  it('describes times in the zone', () => {
    expect(itemTimeText(event({ ends_at: '2026-11-20T16:30:00Z' }), CHICAGO)).toBe('09:00–10:30');
    expect(itemTimeText(event({}), KARACHI)).toBe('20:00');
    expect(
      itemTimeText(event({ starts_at: '2026-11-16T15:00:00Z', ends_at: '2026-11-20T23:00:00Z' }), CHICAGO),
    ).toBe('09:00, Mon 16 Nov to 17:00, Fri 20 Nov');
    expect(
      itemTimeText({ type: 'reminder', id: 'r', title: 'x', date: '2026-11-20', starts_at: null, done_at: null, application: null }),
    ).toBe('All day');
  }); // prettier-ignore
});

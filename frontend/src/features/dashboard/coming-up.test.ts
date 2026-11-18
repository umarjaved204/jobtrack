import { describe, expect, it } from 'vitest';

import { makeApplication } from '@/test/fake-applications';
import { toInstant } from '@/features/reminders/due';
import type { Application, Board } from '@/types/application';
import type { EventItem } from '@/types/calendar';
import type { Reminder } from '@/types/reminder';

import { comingUp, type Entry, LOOKAHEAD_DAYS, OVERDUE_DAYS, relativeDue } from './coming-up';

const board = (...applications: Application[]): Board => ({
  columns: [{ status: 'wishlist', applications }],
});
/** A wishlist role with an apply-by date (deadline_on). */
const applyBy = (
  company: string,
  deadline_on: string,
  status: Application['status'] = 'wishlist',
) => makeApplication({ company, deadline_on, status, applied_on: null });
const names = (list: Entry[]) => list.map((e) => e.title);

const TODAY = '2026-11-18';

describe('comingUp: the as_of boundary', () => {
  it('counts today as due, not overdue; yesterday is overdue', () => {
    const result = comingUp(
      { board: board(applyBy('Today', '2026-11-18'), applyBy('Yesterday', '2026-11-17')) },
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Today']);
    expect(names(result.overdue)).toEqual(['Yesterday']);
    expect(result.upcoming[0]?.days).toBe(0);
  });

  it(`looks ${LOOKAHEAD_DAYS} days ahead, today included`, () => {
    const result = comingUp(
      { board: board(applyBy('Last day', '2026-12-01'), applyBy('Too far', '2026-12-02')) },
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Last day']); // today + 13
  });

  it('follows the given date, not the clock: the same date moves as the day changes', () => {
    const b = board(applyBy('Monzo', '2026-11-20'));
    expect(comingUp({ board: b }, '2026-11-20').upcoming[0]?.days).toBe(0);
    expect(comingUp({ board: b }, '2026-11-21').overdue[0]?.days).toBe(-1);
  });

  it('crosses month and year ends by calendar day', () => {
    const result = comingUp({ board: board(applyBy('New year', '2027-01-02')) }, '2026-12-30');
    expect(result.upcoming[0]?.days).toBe(3);
  });
});

describe('comingUp: wishlist apply-by dates only', () => {
  it('leaves out every stage after the wishlist (the date no longer needs action)', () => {
    const result = comingUp(
      {
        board: board(
          applyBy('Wishlist', '2026-11-20'),
          ...(['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'] as const).map(
            (status) => applyBy(status, '2026-11-19', status),
          ),
          applyBy('Missed, applied anyway', '2026-11-01', 'applied'),
        ),
      },
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Wishlist']);
    expect(result.overdue).toEqual([]);
    expect(result.olderOverdue).toBe(0);
  });

  it('skips roles without an apply-by date', () => {
    expect(
      comingUp({ board: board(makeApplication({ status: 'wishlist', deadline_on: null })) }, TODAY),
    ).toEqual({
      overdue: [],
      olderOverdue: 0,
      upcoming: [],
    });
  });

  it('sorts soonest first (oldest overdue first), then by company', () => {
    const result = comingUp(
      {
        board: board(
          applyBy('B', '2026-11-25'),
          applyBy('A', '2026-11-25'),
          applyBy('C', '2026-11-19'),
          applyBy('Old', '2026-11-01'),
          applyBy('Recent', '2026-11-16'),
        ),
      },
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['C', 'A', 'B']);
    expect(names(result.overdue)).toEqual(['Old', 'Recent']);
  });
});

describe(`comingUp: missed dates are listed for ${OVERDUE_DAYS} days, then only counted`, () => {
  it('lists a date missed exactly 30 days ago and counts anything older', () => {
    const result = comingUp(
      {
        board: board(
          applyBy('30 days', '2026-10-19'),
          applyBy('31 days', '2026-10-18'),
          applyBy('Last year', '2025-11-18'),
        ),
      },
      TODAY,
    );
    expect(names(result.overdue)).toEqual(['30 days']);
    expect(result.olderOverdue).toBe(2);
  });
});

describe('relativeDue', () => {
  it('reads like speech', () => {
    expect([0, 1, 5, -1, -3].map(relativeDue)).toEqual([
      'Today',
      'Tomorrow',
      'In 5 days',
      'Yesterday',
      '3 days ago',
    ]);
  });
});

describe('comingUp: follow-up reminders', () => {
  // Wednesday 18 November 2026, 15:00 local; reminders' times are local wall times.
  const now = new Date(2026, 10, 18, 15, 0);
  const reminder = (title: string, fields: Partial<Reminder>): Reminder => ({
    id: title,
    title,
    application: null,
    due_on: null,
    due_at: null,
    done_at: null,
    ...fields,
  });
  const at = (day: string, time: string) => toInstant(day, time);

  it('lists overdue reminders with missed apply-by dates, the rest in the window', () => {
    const result = comingUp(
      {
        board: board(applyBy('Wise', '2026-11-16')),
        reminders: [
          reminder('All day yesterday', { due_on: '2026-11-17' }),
          reminder('All day today', { due_on: '2026-11-18' }), // due, not overdue
          reminder('Earlier today', { due_at: at('2026-11-18', '09:00') }), // overdue already
          reminder('Later today', { due_at: at('2026-11-18', '17:30') }),
          reminder('In 13 days', { due_on: '2026-12-01' }),
          reminder('In 14 days', { due_on: '2026-12-02' }), // past the window
        ],
      },
      TODAY,
      now,
    );
    expect(names(result.overdue)).toEqual(['Wise', 'All day yesterday', 'Earlier today']);
    expect(names(result.upcoming)).toEqual(['All day today', 'Later today', 'In 13 days']);
  });

  it(`caps overdue reminders at ${OVERDUE_DAYS} days like apply-by dates`, () => {
    const result = comingUp(
      {
        board: board(applyBy('Old role', '2026-09-01')),
        reminders: [
          reminder('30 days', { due_on: '2026-10-19' }),
          reminder('31 days', { due_on: '2026-10-18' }),
        ],
      },
      TODAY,
      now,
    );
    expect(names(result.overdue)).toEqual(['30 days']);
    expect(result.olderOverdue).toBe(2);
  });

  it('ignores done reminders', () => {
    const done = reminder('Done', { due_on: '2026-11-17', done_at: '2026-11-17T10:00:00Z' });
    expect(comingUp({ board: board(), reminders: [done] }, TODAY, now).overdue).toEqual([]);
  });
});

describe('comingUp: events', () => {
  const now = new Date(2026, 10, 18, 15, 0);
  const event = (title: string, fields: Partial<EventItem>): EventItem => ({
    type: 'event',
    id: title,
    kind: 'interview',
    title,
    starts_at: toInstant('2026-11-20', '10:00'),
    ends_at: null,
    location_or_link: null,
    application: null,
    ...fields,
  });

  it('includes interviews, assessments and deadlines, not other events', () => {
    const result = comingUp(
      {
        board: board(),
        feed: [
          event('Interview', {}),
          event('Offer reply', { kind: 'deadline', starts_at: toInstant('2026-11-23', '17:00') }),
          event('Coffee chat', { kind: 'other' }),
        ],
      },
      TODAY,
      now,
    );
    expect(names(result.upcoming)).toEqual(['Interview', 'Offer reply']);
    expect(result.overdue).toEqual([]); // events are never overdue
  });

  it('drops events that are over, and lists a running one today', () => {
    const result = comingUp(
      {
        board: board(),
        feed: [
          event('This morning', { starts_at: toInstant('2026-11-18', '09:00'), ends_at: toInstant('2026-11-18', '10:00') }),
          event('Take-home window', { kind: 'assessment', starts_at: toInstant('2026-11-16', '09:00'), ends_at: toInstant('2026-11-21', '17:00') }),
          event('Tonight', { starts_at: toInstant('2026-11-18', '19:00') }),
        ],
      },
      TODAY,
      now,
    ); // prettier-ignore
    expect(names(result.upcoming)).toEqual(['Take-home window', 'Tonight']);
    expect(result.upcoming[0]).toMatchObject({ day: TODAY, days: 0, at: null });
  });

  it('orders a day: all-day items first, then by time', () => {
    const result = comingUp(
      {
        board: board(applyBy('Figma', '2026-11-20')),
        feed: [event('Afternoon', { starts_at: toInstant('2026-11-20', '15:00') }), event('Morning', {})],
      },
      TODAY,
      now,
    ); // prettier-ignore
    expect(names(result.upcoming)).toEqual(['Figma', 'Morning', 'Afternoon']);
  });
});

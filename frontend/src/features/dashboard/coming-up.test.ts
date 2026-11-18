import { describe, expect, it } from 'vitest';

import { makeApplication } from '@/test/fake-applications';
import type { Application, Board } from '@/types/application';

import { comingUp, LOOKAHEAD_DAYS, OVERDUE_DAYS, relativeDue } from './coming-up';

const board = (...applications: Application[]): Board => ({
  columns: [{ status: 'wishlist', applications }],
});
/** A wishlist role with an apply-by date (deadline_on). */
const applyBy = (
  company: string,
  deadline_on: string,
  status: Application['status'] = 'wishlist',
) => makeApplication({ company, deadline_on, status, applied_on: null });
const names = (list: { application: Application }[]) => list.map((d) => d.application.company);

const TODAY = '2026-11-18';

describe('comingUp: the as_of boundary', () => {
  it('counts today as due, not overdue; yesterday is overdue', () => {
    const result = comingUp(
      board(applyBy('Today', '2026-11-18'), applyBy('Yesterday', '2026-11-17')),
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Today']);
    expect(names(result.overdue)).toEqual(['Yesterday']);
    expect(result.upcoming[0]?.days).toBe(0);
  });

  it(`looks ${LOOKAHEAD_DAYS} days ahead, today included`, () => {
    const result = comingUp(
      board(applyBy('Last day', '2026-12-01'), applyBy('Too far', '2026-12-02')),
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Last day']); // today + 13
  });

  it('follows the given date, not the clock: the same date moves as the day changes', () => {
    const b = board(applyBy('Monzo', '2026-11-20'));
    expect(comingUp(b, '2026-11-20').upcoming[0]?.days).toBe(0);
    expect(comingUp(b, '2026-11-21').overdue[0]?.days).toBe(-1);
  });

  it('crosses month and year ends by calendar day', () => {
    const result = comingUp(board(applyBy('New year', '2027-01-02')), '2026-12-30');
    expect(result.upcoming[0]?.days).toBe(3);
  });
});

describe('comingUp: wishlist apply-by dates only', () => {
  it('leaves out every stage after the wishlist (the date no longer needs action)', () => {
    const result = comingUp(
      board(
        applyBy('Wishlist', '2026-11-20'),
        ...(['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'] as const).map(
          (status) => applyBy(status, '2026-11-19', status),
        ),
        applyBy('Missed, applied anyway', '2026-11-01', 'applied'),
      ),
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Wishlist']);
    expect(result.overdue).toEqual([]);
    expect(result.olderOverdue).toBe(0);
  });

  it('skips roles without an apply-by date', () => {
    expect(
      comingUp(board(makeApplication({ status: 'wishlist', deadline_on: null })), TODAY),
    ).toEqual({
      overdue: [],
      olderOverdue: 0,
      upcoming: [],
    });
  });

  it('sorts soonest first (oldest overdue first), then by company', () => {
    const result = comingUp(
      board(
        applyBy('B', '2026-11-25'),
        applyBy('A', '2026-11-25'),
        applyBy('C', '2026-11-19'),
        applyBy('Old', '2026-11-01'),
        applyBy('Recent', '2026-11-16'),
      ),
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['C', 'A', 'B']);
    expect(names(result.overdue)).toEqual(['Old', 'Recent']);
  });
});

describe(`comingUp: missed dates are listed for ${OVERDUE_DAYS} days, then only counted`, () => {
  it('lists a date missed exactly 30 days ago and counts anything older', () => {
    const result = comingUp(
      board(
        applyBy('30 days', '2026-10-19'),
        applyBy('31 days', '2026-10-18'),
        applyBy('Last year', '2025-11-18'),
      ),
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

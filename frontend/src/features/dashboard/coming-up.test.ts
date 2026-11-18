import { describe, expect, it } from 'vitest';

import { makeApplication } from '@/test/fake-applications';
import type { Application, Board } from '@/types/application';

import { comingUp, LOOKAHEAD_DAYS, relativeDue } from './coming-up';

const board = (...applications: Application[]): Board => ({
  columns: [{ status: 'applied', applications }],
});
const due = (company: string, deadline_on: string, status: Application['status'] = 'applied') =>
  makeApplication({ company, deadline_on, status });
const names = (list: { application: Application }[]) => list.map((d) => d.application.company);

const TODAY = '2026-11-18';

describe('comingUp: the as_of boundary', () => {
  it('counts today as due, not overdue; yesterday is overdue', () => {
    const result = comingUp(
      board(due('Today', '2026-11-18'), due('Yesterday', '2026-11-17')),
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Today']);
    expect(names(result.overdue)).toEqual(['Yesterday']);
    expect(result.upcoming[0]?.days).toBe(0);
  });

  it(`looks ${LOOKAHEAD_DAYS} days ahead, today included`, () => {
    const result = comingUp(
      board(due('Last day', '2026-12-01'), due('Too far', '2026-12-02')),
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Last day']); // today + 13
  });

  it('follows the given date, not the clock: the same deadline moves as the day changes', () => {
    const b = board(due('Monzo', '2026-11-20'));
    expect(comingUp(b, '2026-11-20').upcoming[0]?.days).toBe(0);
    expect(comingUp(b, '2026-11-21').overdue[0]?.days).toBe(-1);
  });

  it('crosses month and year ends by calendar day', () => {
    const result = comingUp(board(due('New year', '2027-01-02')), '2026-12-30');
    expect(result.upcoming[0]?.days).toBe(3);
  });
});

describe('comingUp: what counts', () => {
  it('keeps wishlist and active applications, not rejected or withdrawn ones', () => {
    const result = comingUp(
      board(
        due('Wishlist', '2026-11-20', 'wishlist'),
        due('Offer', '2026-11-20', 'offer'),
        due('Rejected', '2026-11-20', 'rejected'),
        due('Withdrawn', '2026-11-19', 'withdrawn'),
      ),
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['Offer', 'Wishlist']);
  });

  it('skips applications without a deadline', () => {
    expect(comingUp(board(makeApplication({ deadline_on: null })), TODAY)).toEqual({
      overdue: [],
      upcoming: [],
    });
  });

  it('sorts soonest first (oldest overdue first), then by company', () => {
    const result = comingUp(
      board(
        due('B', '2026-11-25'),
        due('A', '2026-11-25'),
        due('C', '2026-11-19'),
        due('Old', '2026-11-01'),
        due('Recent', '2026-11-16'),
      ),
      TODAY,
    );
    expect(names(result.upcoming)).toEqual(['C', 'A', 'B']);
    expect(names(result.overdue)).toEqual(['Old', 'Recent']);
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

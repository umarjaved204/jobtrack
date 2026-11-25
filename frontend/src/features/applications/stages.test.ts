import { format } from 'date-fns/format';
import { describe, expect, it } from 'vitest';

import type { ApplicationEvent, ApplicationStatus } from '@/types/application';

import { stageTrack } from './stages';

let seq = 0;
const move = (
  from: ApplicationStatus | null,
  to: ApplicationStatus,
  created_at: string,
): ApplicationEvent => ({
  id: `e${++seq}`,
  type: 'status_change',
  from_status: from,
  to_status: to,
  body: null,
  created_at,
});
const note = (created_at: string): ApplicationEvent => ({
  id: `n${++seq}`,
  type: 'note',
  from_status: null,
  to_status: null,
  body: 'Spoke to the recruiter',
  created_at,
});

// The local calendar day (date-only values are local midnight; never via UTC).
const day = (date: Date | null) => (date ? format(date, 'yyyy-MM-dd') : null);

describe('stageTrack', () => {
  it('marks stages reached from the history, dated by the first move that got there', () => {
    const events = [
      move('interview', 'rejected', '2026-11-12T12:00:00Z'), // newest first, like the API
      note('2026-11-08T12:00:00Z'),
      move('applied', 'interview', '2026-11-05T12:00:00Z'), // skipped Screening
      move(null, 'applied', '2026-11-01T12:00:00Z'),
    ];
    const { steps, outcome } = stageTrack({ status: 'rejected', applied_on: '2026-11-01' }, events);

    expect(steps.map((s) => [s.stage, s.reached, day(s.on)])).toEqual([
      ['applied', true, '2026-11-01'],
      ['screening', true, '2026-11-05'], // reached on the day it was skipped past
      ['interview', true, '2026-11-05'],
      ['offer', false, null],
    ]);
    expect(steps.some((s) => s.current)).toBe(false);
    expect(outcome).toEqual({ status: 'rejected', on: new Date('2026-11-12T12:00:00Z') });
  });

  it('counts the current status even without history, and marks it current', () => {
    const { steps, outcome } = stageTrack({ status: 'screening', applied_on: null }, []);

    expect(steps.map((s) => [s.stage, s.reached, s.on, s.current])).toEqual([
      ['applied', true, null, false],
      ['screening', true, null, true],
      ['interview', false, null, false],
      ['offer', false, null, false],
    ]);
    expect(outcome).toBeNull();
  });

  it('reaches nothing on the wishlist', () => {
    const { steps } = stageTrack({ status: 'wishlist', applied_on: null }, [
      move(null, 'wishlist', '2026-11-01T12:00:00Z'),
    ]);
    expect(steps.every((s) => !s.reached)).toBe(true);
  });
});

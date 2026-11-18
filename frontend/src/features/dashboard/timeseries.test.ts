import { describe, expect, it } from 'vitest';

import type { AnalyticsTimeseries } from '@/types/analytics';

import { bucketLabel, describeTimeseries, isCurrentBucket, tickLabel } from './timeseries';

const weeks = (counts: number[], first = '2026-10-05'): AnalyticsTimeseries => ({
  interval: 'week',
  points: counts.map((count, i) => {
    const date = new Date(Date.UTC(2026, 9, 5 + i * 7));
    return { start: i === 0 ? first : date.toISOString().slice(0, 10), count };
  }),
});

describe('labels', () => {
  it('labels weeks by their Monday and months by name', () => {
    expect(tickLabel('2026-10-05', 'week')).toBe('5 Oct');
    expect(tickLabel('2026-10-01', 'month')).toBe('Oct 2026');
    expect(bucketLabel('2026-10-05', 'week')).toBe('Week of 5 Oct 2026');
    expect(bucketLabel('2026-10-01', 'month')).toBe('October 2026');
  });
});

describe('isCurrentBucket', () => {
  const week = { start: '2026-11-16', count: 2 }; // Monday
  it('includes Monday to Sunday of its week', () => {
    expect(isCurrentBucket(week, 'week', '2026-11-16')).toBe(true);
    expect(isCurrentBucket(week, 'week', '2026-11-22')).toBe(true); // Sunday
    expect(isCurrentBucket(week, 'week', '2026-11-23')).toBe(false); // next Monday
    expect(isCurrentBucket(week, 'week', '2026-11-15')).toBe(false);
  });

  it('includes the whole calendar month for monthly buckets', () => {
    const month = { start: '2026-02-01', count: 1 };
    expect(isCurrentBucket(month, 'month', '2026-02-28')).toBe(true);
    expect(isCurrentBucket(month, 'month', '2026-03-01')).toBe(false);
  });
});

describe('describeTimeseries', () => {
  it('summarises total, average and the busiest bucket', () => {
    expect(describeTimeseries(weeks([1, 5, 0, 2]), '2026-12-31')).toBe(
      '8 applications over 4 weeks, about 2 a week. Busiest: week of 12 Oct 2026 (5).',
    );
  });

  it('mentions the current bucket as "so far"', () => {
    expect(describeTimeseries(weeks([3, 1]), '2026-10-14')).toBe(
      '4 applications over 2 weeks, about 2 a week. Busiest: week of 5 Oct 2026 (3). ' +
        'This week so far: 1.',
    );
  });

  it('says so when there is nothing to show, including all-zero buckets', () => {
    expect(describeTimeseries({ interval: 'week', points: [] }, '2026-11-18')).toBe(
      'No applications in this period.',
    );
    expect(describeTimeseries(weeks([0, 0, 0]), '2026-11-18')).toBe(
      'No applications in this period.',
    );
  });

  it('uses months and singular words where they fit', () => {
    const series: AnalyticsTimeseries = {
      interval: 'month',
      points: [
        { start: '2026-09-01', count: 1 },
        { start: '2026-10-01', count: 0 },
      ],
    };
    expect(describeTimeseries(series, '2026-12-01')).toBe(
      '1 application over 2 months, about 0.5 a month. Busiest: September 2026 (1).',
    );
  });
});

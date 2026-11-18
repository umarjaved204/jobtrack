import { subDays } from 'date-fns/subDays';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

import { parseDateOnly, toDateOnly } from '@/lib/dates';
import type { AnalyticsPeriod } from '@/types/analytics';
import type { DateOnly } from '@/types/application';

/*
 * The dashboard's date range, kept in the URL (?range=30d) so it survives reloads and
 * Back/Forward. Dates are computed from the *browser's* calendar day, never the server's
 * UTC "today": at 01:00 in UTC+5, the server's clock is still on the previous day.
 */

export const ranges = ['30d', '90d', 'all'] as const;
export type DashboardRange = (typeof ranges)[number];
export const DEFAULT_RANGE: DashboardRange = '90d';

export const rangeLabels: Record<DashboardRange, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

const rangeSchema = z.enum(ranges);

/** `?range=` value → range; anything else → the default. */
export function parseRange(value: string | null): DashboardRange {
  const result = rangeSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_RANGE;
}

const days: Record<Exclude<DashboardRange, 'all'>, number> = { '30d': 30, '90d': 90 };

/** The API period for a range ending on `today` (inclusive: "last 30 days" is 30 days). */
export function periodFor(range: DashboardRange, today: DateOnly): AnalyticsPeriod {
  if (range === 'all') return {};
  return { from: toDateOnly(subDays(parseDateOnly(today), days[range] - 1)), to: today };
}

export function useDashboardRange(today: DateOnly) {
  const [searchParams, setSearchParams] = useSearchParams();
  const range = parseRange(searchParams.get('range'));
  const period = useMemo(() => periodFor(range, today), [range, today]);

  const setRange = useCallback(
    (next: DashboardRange) =>
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === DEFAULT_RANGE) params.delete('range');
          else params.set('range', next);
          return params;
        },
        { preventScrollReset: true },
      ),
    [setSearchParams],
  );

  return { range, period, setRange };
}

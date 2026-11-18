import { addDays } from 'date-fns/addDays';
import { addMonths } from 'date-fns/addMonths';
import { format } from 'date-fns/format';

import { parseDateOnly, toDateOnly } from '@/lib/dates';
import type { AnalyticsTimeseries, TimeseriesPoint } from '@/types/analytics';
import type { DateOnly } from '@/types/application';

type Interval = AnalyticsTimeseries['interval'];

/** First day after the bucket that starts at `start`. */
function bucketEnd(start: DateOnly, interval: Interval): DateOnly {
  const date = parseDateOnly(start);
  return toDateOnly(interval === 'week' ? addDays(date, 7) : addMonths(date, 1));
}

/** Does this bucket contain `today` (so its count is still growing)? */
export function isCurrentBucket(point: TimeseriesPoint, interval: Interval, today: DateOnly) {
  return point.start <= today && today < bucketEnd(point.start, interval);
}

/** Axis label: "5 Oct" for a week, "Oct 2026" for a month. */
export function tickLabel(start: DateOnly, interval: Interval): string {
  return format(parseDateOnly(start), interval === 'week' ? 'd MMM' : 'MMM yyyy');
}

/** Full label for tooltips and the data table: "Week of 5 Oct 2026" / "October 2026". */
export function bucketLabel(start: DateOnly, interval: Interval): string {
  const date = parseDateOnly(start);
  return interval === 'week' ? `Week of ${format(date, 'd MMM yyyy')}` : format(date, 'MMMM yyyy');
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One or two sentences that say what the chart shows, for screen readers (and as the
 * chart's caption): total, span, average, the busiest bucket, and the current one so far.
 */
export function describeTimeseries(series: AnalyticsTimeseries, today: DateOnly): string {
  const { interval, points } = series;
  const total = points.reduce((sum, p) => sum + p.count, 0);
  if (total === 0) return 'No applications in this period.';

  const unit = interval === 'week' ? 'week' : 'month';
  const average = total / points.length;
  const busiest = points.reduce((best, p) => (p.count > best.count ? p : best));
  const current = points.at(-1);

  const parts = [
    `${plural(total, 'application')} over ${plural(points.length, unit)}, ` +
      `about ${average.toLocaleString('en-GB', { maximumFractionDigits: 1 })} a ${unit}.`,
    `Busiest: ${bucketLabel(busiest.start, interval).replace(/^Week/, 'week')} (${busiest.count}).`,
  ];
  if (current && isCurrentBucket(current, interval, today)) {
    parts.push(`This ${unit} so far: ${current.count}.`);
  }
  return parts.join(' ');
}

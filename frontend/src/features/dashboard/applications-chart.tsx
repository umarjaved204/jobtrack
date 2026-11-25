import { useReducedMotion } from 'motion/react';
import { Bar, BarChart, CartesianGrid, Rectangle, Tooltip, XAxis, YAxis } from 'recharts';

import { cn } from '@/lib/utils';
import type { AnalyticsTimeseries } from '@/types/analytics';
import type { DateOnly } from '@/types/application';

import { SectionHeading } from './section-heading';
import { bucketLabel, describeTimeseries, isCurrentBucket, tickLabel } from './timeseries';

type Row = { start: DateOnly; count: number; tick: string; label: string; current: boolean };

const plural = (n: number) => `${n} application${n === 1 ? '' : 's'}`;

/** Value first (what the reader came for), then the bucket. */
// Only the fields this reads (Recharts' own content-props generics don't line up with
// <Tooltip content>); each payload entry's `payload` is the hovered row.
type ChartTooltipProps = { active?: boolean; payload?: readonly { payload?: unknown }[] };

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  return (
    <div className="border border-rule bg-popover px-3 py-2 text-sm shadow-print-sm">
      <p className="font-semibold">
        {plural(row.count)}
        {row.current && ' so far'}
      </p>
      <p className="text-muted-foreground">{row.label}</p>
    </div>
  );
}

type ApplicationsChartProps = {
  series: AnalyticsTimeseries;
  today: DateOnly;
  /** Showing the previous range's data while the new one loads: keep the frame, dim it. */
  stale?: boolean;
};

/**
 * Applications per week (or month): one series, so no legend; the heading names it.
 * Columns in the primary colour, 34px at most with a 4px rounded top; recessive dashed
 * grid; whole-number ticks; no number on every bar (the tooltip and table carry them). The current, still-growing bucket is drawn lighter and called
 * "so far" so it doesn't read as a slump. A caption and a visually hidden table carry the
 * same information as the picture.
 */
function ApplicationsChart({ series, today, stale = false }: ApplicationsChartProps) {
  const reduceMotion = useReducedMotion();
  const rows: Row[] = series.points.map((p) => ({
    ...p,
    tick: tickLabel(p.start, series.interval),
    label: bucketLabel(p.start, series.interval),
    current: isCurrentBucket(p, series.interval, today),
  }));
  const summary = describeTimeseries(series, today);
  const unit = series.interval === 'week' ? 'Week' : 'Month';
  const empty = rows.every((r) => r.count === 0);

  return (
    <figure aria-labelledby="over-time-heading" className="grid content-start gap-3">
      <figcaption>
        <SectionHeading id="over-time-heading" title="Applications over time">
          {summary}
        </SectionHeading>
      </figcaption>

      {empty ? (
        <p className="grid h-56 place-items-center border border-dashed border-border-quiet px-4 text-center text-sm text-muted-foreground">
          Applications you send in this period will show here, week by week.
        </p>
      ) : (
        <div
          className={cn(
            'h-64 transition-opacity duration-(--duration-fast)',
            stale && 'opacity-60',
          )}
        >
          <BarChart
            responsive
            data={rows}
            margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
            title={`Applications per ${unit.toLowerCase()}`}
            style={{ width: '100%', height: '100%' }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="tick"
              tickLine={false}
              axisLine={{ stroke: 'var(--rule)' }}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              width={40}
            />
            <Tooltip
              content={ChartTooltip}
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              isAnimationActive={false}
            />
            <Bar
              dataKey="count"
              fill="var(--primary)"
              maxBarSize={34}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reduceMotion}
              shape={(props) => (
                <Rectangle {...props} fillOpacity={(props.payload as Row).current ? 0.45 : 1} />
              )}
            />
          </BarChart>
        </div>
      )}

      <table className="sr-only">
        <caption>Applications per {unit.toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col">{unit}</th>
            <th scope="col">Applications</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.start}>
              <th scope="row">{row.label}</th>
              <td>
                {row.count}
                {row.current && ' so far'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export { ApplicationsChart };

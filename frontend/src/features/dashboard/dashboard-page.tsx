import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { todayDateOnly } from '@/lib/dates';

import { summaryQuery, timeseriesQuery } from './api';
import { ApplicationsChart } from './applications-chart';
import { LoadError } from './load-error';
import { rangeLabels, useDashboardRange } from './range';
import { RangePicker } from './range-picker';
import { StatStrip, StatStripSkeleton } from './stat-strip';

function DashboardPage() {
  // The browser's calendar day (not the server's UTC date): see range.ts.
  const today = todayDateOnly();
  const { range, period, setRange } = useDashboardRange(today);
  const summary = useQuery(summaryQuery(period));
  const timeseries = useQuery(timeseriesQuery(period));

  let figures;
  if (summary.isError && !summary.data) {
    figures = (
      <LoadError
        title="Your figures didn’t load"
        error={summary.error}
        onRetry={() => void summary.refetch()}
      />
    );
  } else if (!summary.data) {
    figures = <StatStripSkeleton />;
  } else {
    figures = (
      <StatStrip
        summary={summary.data}
        // While the previous range's figures are shown, they keep their old cause.
        cause={summary.isPlaceholderData ? null : range}
        rangeLabel={rangeLabels[range]}
      />
    );
  }

  let overTime;
  if (timeseries.isError && !timeseries.data) {
    overTime = (
      <LoadError
        title="Applications over time didn’t load"
        error={timeseries.error}
        onRetry={() => void timeseries.refetch()}
      />
    );
  } else if (!timeseries.data) {
    overTime = (
      <div aria-busy="true" aria-label="Loading applications over time" className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else {
    overTime = (
      <ApplicationsChart
        series={timeseries.data}
        today={today}
        stale={timeseries.isPlaceholderData}
      />
    );
  }

  return (
    <>
      <PageHeader
        kicker="Overview"
        title="Dashboard"
        description="Your search at a glance: what you’ve applied for, how far it got, and where it came from."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      <div className="mt-8 grid gap-12">
        {figures}
        {overTime}
      </div>
    </>
  );
}

export { DashboardPage };

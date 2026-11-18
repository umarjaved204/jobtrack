import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Newspaper, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { todayDateOnly } from '@/lib/dates';

import { boardQuery } from '@/features/applications/api';

import { funnelQuery, sourcesQuery, summaryQuery, timeseriesQuery } from './api';
import { ApplicationsChart } from './applications-chart';
import { ComingUpPanel } from './coming-up-panel';
import { Funnel } from './funnel';
import { LoadError } from './load-error';
import { rangeLabels, useDashboardRange } from './range';
import { RangePicker } from './range-picker';
import { Sources } from './sources';
import { StatStrip, StatStripSkeleton } from './stat-strip';

/**
 * One dashboard section's states: its own error (with retry) and skeleton, so a slow or
 * failed query never holds up or blanks the others. `stale` is true while the previous
 * range's data is shown (keep the frame, dim it).
 */
function section<T>(
  query: UseQueryResult<T>,
  failed: string,
  loading: ReactNode,
  render: (data: T, stale: boolean) => ReactNode,
): ReactNode {
  if (query.isError && query.data === undefined) {
    return <LoadError title={failed} error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (query.data === undefined) return loading;
  return render(query.data, query.isPlaceholderData);
}

function SectionSkeleton({ label, height }: { label: string; height: string }) {
  return (
    <div aria-busy="true" aria-label={`Loading ${label}`} className="grid content-start gap-3">
      <Skeleton className="h-7 w-48" />
      <Skeleton className={`${height} w-full`} />
    </div>
  );
}

function DashboardPage() {
  // The browser's calendar day (not the server's UTC date): see range.ts.
  const today = todayDateOnly();
  const { range, period, setRange } = useDashboardRange(today);
  const summary = useQuery(summaryQuery(period));
  const timeseries = useQuery(timeseriesQuery(period));
  const funnel = useQuery(funnelQuery(period));
  const sources = useQuery(sourcesQuery(period));
  // Every application, for deadlines (and to spot a brand-new account). Often cached
  // already from the Applications page.
  const board = useQuery(boardQuery());
  const isNewAccount = board.data?.columns.every((c) => c.applications.length === 0) ?? false;

  if (isNewAccount) {
    return (
      <>
        <PageHeader
          kicker="Overview"
          title="Dashboard"
          description="Your search at a glance: what you’ve applied for, how far it got, and where it came from."
        />
        <EmptyState
          icon={Newspaper}
          title="Your figures start with your first application"
          className="mt-10"
          action={
            <Button asChild>
              <Link to="/applications">
                <Plus /> Add an application
              </Link>
            </Button>
          }
        >
          Once you’re tracking applications, this page shows how many you’ve sent, how far they got,
          where they came from and which deadlines are close.
        </EmptyState>
      </>
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
        {section(summary, 'Your figures didn’t load', <StatStripSkeleton />, (data, stale) => (
          <StatStrip
            summary={data}
            // While the previous range's figures are shown, they keep their old cause.
            cause={stale ? null : range}
            rangeLabel={rangeLabels[range]}
          />
        ))}
        <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-16">
          {section(
            timeseries,
            'Applications over time didn’t load',
            <SectionSkeleton label="applications over time" height="h-64" />,
            (data, stale) => (
              <ApplicationsChart series={data} today={today} stale={stale} />
            ),
          )}
          {section(
            board,
            'Deadlines didn’t load',
            <SectionSkeleton label="deadlines" height="h-48" />,
            (data) => (
              <ComingUpPanel board={data} today={today} />
            ),
          )}
        </div>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {section(
            funnel,
            'The pipeline didn’t load',
            <SectionSkeleton label="the pipeline" height="h-48" />,
            (data, stale) => (
              <Funnel funnel={data} stale={stale} />
            ),
          )}
          {section(
            sources,
            'Sources didn’t load',
            <SectionSkeleton label="sources" height="h-48" />,
            (data, stale) => (
              <Sources sources={data} stale={stale} />
            ),
          )}
        </div>
      </div>
    </>
  );
}

export { DashboardPage };

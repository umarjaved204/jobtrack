import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Newspaper, Plus } from 'lucide-react';
import { addDays } from 'date-fns/addDays';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { todayDateOnly } from '@/lib/dates';

import { boardQuery } from '@/features/applications/api';
import { calendarFeedQuery } from '@/features/calendar/api';
import { feedRange } from '@/features/calendar/month';
import { remindersQuery } from '@/features/reminders/api';
import { parseDateOnly, toDateOnly } from '@/lib/dates';
import type { Board, DateOnly } from '@/types/application';

import { funnelQuery, sourcesQuery, summaryQuery, timeseriesQuery } from './api';
import { ApplicationsChart } from './applications-chart';
import { type ComingUpSources, LOOKAHEAD_DAYS } from './coming-up';
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
/** What `section` needs from a query (several queries can be combined into one). */
type SectionQuery<T> = Pick<
  UseQueryResult<T>,
  'data' | 'isError' | 'error' | 'isPlaceholderData'
> & {
  refetch: () => unknown;
};

function section<T>(
  query: SectionQuery<T>,
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

/**
 * "Coming up" needs every application (apply-by dates), every open reminder (overdue ones
 * can be long past) and the next LOOKAHEAD_DAYS days of the calendar (events).
 */
function useComingUpSources(
  board: UseQueryResult<Board>,
  today: DateOnly,
): SectionQuery<ComingUpSources> {
  const reminders = useQuery(remindersQuery({ status: 'open' }));
  const last = toDateOnly(addDays(parseDateOnly(today), LOOKAHEAD_DAYS - 1));
  const feed = useQuery(calendarFeedQuery(feedRange(today, last)));
  const queries = [board, reminders, feed];
  const failed = queries.find((q) => q.isError);
  return {
    data:
      board.data && reminders.data && feed.data
        ? { board: board.data, reminders: reminders.data, feed: feed.data.items }
        : undefined,
    isError: failed !== undefined,
    error: failed?.error ?? null,
    isPlaceholderData: false,
    refetch: () => Promise.all(queries.filter((q) => q.isError).map((q) => q.refetch())),
  };
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
  const comingUpSources = useComingUpSources(board, today);
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
        kicker={`Overview · ${rangeLabels[range]}`}
        title="Dashboard"
        description="Your search at a glance: what you’ve applied for, how far it got, and where it came from."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      <div className="mt-7 grid gap-12 lg:gap-14">
        {section(summary, 'Your figures didn’t load', <StatStripSkeleton />, (data, stale) => (
          <StatStrip
            summary={data}
            // While the previous range's figures are shown, they keep their old cause.
            cause={stale ? null : range}
            rangeLabel={rangeLabels[range]}
          />
        ))}
        <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {section(
            timeseries,
            'Applications over time didn’t load',
            <SectionSkeleton label="applications over time" height="h-64" />,
            (data, stale) => (
              <ApplicationsChart series={data} today={today} stale={stale} />
            ),
          )}
          {section(
            comingUpSources,
            'Coming up didn’t load',
            <SectionSkeleton label="what’s coming up" height="h-48" />,
            (data) => (
              <ComingUpPanel sources={data} today={today} />
            ),
          )}
        </div>
        <div className="grid gap-12 lg:grid-cols-2">
          {section(
            funnel,
            'The pipeline didn’t load',
            <SectionSkeleton label="the pipeline" height="h-48" />,
            (data, stale) => (
              <Funnel
                funnel={data}
                outcomes={summary.data?.by_status}
                cause={stale ? null : range}
                stale={stale}
              />
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

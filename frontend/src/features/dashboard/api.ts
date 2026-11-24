import { keepPreviousData, queryOptions } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type {
  AnalyticsFunnel,
  AnalyticsMoves,
  AnalyticsPeriod,
  AnalyticsSources,
  AnalyticsSummary,
  AnalyticsTimeseries,
} from '@/types/analytics';

/*
 * Dashboard analytics (GET /analytics/*). Every query is keyed by the period, so changing
 * the range fetches new figures while the previous ones stay on screen (keepPreviousData)
 * and the counters can animate from old to new. Anything that changes an application
 * invalidates `analyticsKeys.all` (see features/applications/api.ts).
 */
export const analyticsKeys = {
  all: ['analytics'] as const,
  metric: (metric: Metric, period: AnalyticsPeriod) =>
    [...analyticsKeys.all, metric, period] as const,
};

type Metric = 'summary' | 'funnel' | 'sources' | 'timeseries';

export function periodParams({ from, to }: AnalyticsPeriod): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function analyticsQuery<T>(metric: Metric, period: AnalyticsPeriod) {
  return queryOptions({
    queryKey: analyticsKeys.metric(metric, period),
    queryFn: ({ signal }) => api.get<T>(`/analytics/${metric}${periodParams(period)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export const summaryQuery = (period: AnalyticsPeriod) =>
  analyticsQuery<AnalyticsSummary>('summary', period);
export const funnelQuery = (period: AnalyticsPeriod) =>
  analyticsQuery<AnalyticsFunnel>('funnel', period);
export const sourcesQuery = (period: AnalyticsPeriod) =>
  analyticsQuery<AnalyticsSources>('sources', period);
export const timeseriesQuery = (period: AnalyticsPeriod) =>
  analyticsQuery<AnalyticsTimeseries>('timeseries', period);

/** How many latest moves the dashboard shows (the API allows 1 to 20). */
export const MOVES_SHOWN = 5;

/** Latest status changes across every application: one list, no range (see analyticsKeys). */
export const movesQuery = (limit = MOVES_SHOWN) =>
  queryOptions({
    queryKey: [...analyticsKeys.all, 'moves', limit] as const,
    queryFn: ({ signal }) => api.get<AnalyticsMoves>(`/analytics/moves?limit=${limit}`, { signal }),
  });

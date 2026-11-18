import { http, HttpResponse } from 'msw/http';

import type {
  AnalyticsFunnel,
  AnalyticsSources,
  AnalyticsSummary,
  AnalyticsTimeseries,
} from '@/types/analytics';

import { server } from './msw';

/*
 * Canned GET /analytics/* responses (the real computation is tested in the backend). The
 * defaults look like a few months of a real search; pass `empty()` for a new account.
 * `requests` records each call's endpoint and query, e.g. "summary?from=…&to=…".
 * Combine with `mockAuthBackend({ signedIn: true })`.
 */

export type AnalyticsData = {
  summary: AnalyticsSummary;
  funnel: AnalyticsFunnel;
  sources: AnalyticsSources;
  timeseries: AnalyticsTimeseries;
};

export function sampleAnalytics(): AnalyticsData {
  return {
    summary: {
      applied: 32,
      active: 14,
      interviewed: 9,
      offers: 2,
      interview_rate: 9 / 32,
      offer_rate: 2 / 32,
      wishlist: 6,
    },
    funnel: {
      stages: [
        { stage: 'applied', count: 32, rate_from_previous: null },
        { stage: 'screening', count: 17, rate_from_previous: 17 / 32 },
        { stage: 'interview', count: 9, rate_from_previous: 9 / 17 },
        { stage: 'offer', count: 2, rate_from_previous: 2 / 9 },
      ],
    },
    sources: {
      sources: [
        { source: 'LinkedIn', applied: 12, interviewed: 3, interview_rate: 3 / 12 },
        { source: 'Referral', applied: 7, interviewed: 4, interview_rate: 4 / 7 },
        { source: 'Company website', applied: 6, interviewed: 1, interview_rate: 1 / 6 },
        { source: 'Otta', applied: 4, interviewed: 1, interview_rate: 1 / 4 },
        { source: null, applied: 3, interviewed: 0, interview_rate: 0 },
      ],
    },
    timeseries: {
      interval: 'week',
      points: [
        ['2026-08-24', 1],
        ['2026-08-31', 3],
        ['2026-09-07', 2],
        ['2026-09-14', 4],
        ['2026-09-21', 0],
        ['2026-09-28', 3],
        ['2026-10-05', 5],
        ['2026-10-12', 2],
        ['2026-10-19', 4],
        ['2026-10-26', 1],
        ['2026-11-02', 3],
        ['2026-11-09', 2],
        ['2026-11-16', 2],
      ].map(([start, count]) => ({ start: String(start), count: Number(count) })),
    },
  };
}

/** A new account: zero counts, null rates, no sources, no points. */
export function emptyAnalytics(): AnalyticsData {
  return {
    summary: {
      applied: 0,
      active: 0,
      interviewed: 0,
      offers: 0,
      interview_rate: null,
      offer_rate: null,
      wishlist: 0,
    },
    funnel: {
      stages: (['applied', 'screening', 'interview', 'offer'] as const).map((stage) => ({
        stage,
        count: 0,
        rate_from_previous: null,
      })),
    },
    sources: { sources: [] },
    timeseries: { interval: 'week', points: [] },
  };
}

export function mockAnalyticsBackend(data: Partial<AnalyticsData> = {}) {
  const state = { data: { ...sampleAnalytics(), ...data }, requests: [] as string[] };
  const metrics = ['summary', 'funnel', 'sources', 'timeseries'] as const;

  server.use(
    ...metrics.map((metric) =>
      http.get(`/api/v1/analytics/${metric}`, ({ request }) => {
        if (!request.headers.get('Authorization')?.startsWith('Bearer ')) {
          return HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 });
        }
        const query = new URL(request.url).searchParams.toString();
        state.requests.push(query ? `${metric}?${query}` : metric);
        return HttpResponse.json(state.data[metric]);
      }),
    ),
  );
  return state;
}

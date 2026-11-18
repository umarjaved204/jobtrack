import { type QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { useMoveApplication } from '@/features/applications/api';
import { createQueryClient } from '@/lib/query-client';
import { emptyAnalytics, mockAnalyticsBackend } from '@/test/fake-analytics';
import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend } from '@/test/msw';

import { periodParams, summaryQuery, timeseriesQuery } from './api';
import { useDashboardRange } from './range';

let queryClient: QueryClient;
function wrapperAt(url = '/dashboard') {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = createQueryClient();
  mockAuthBackend({ signedIn: true });
});

describe('analytics queries', () => {
  it('sends the period as from/to, leaving out open ends', () => {
    expect(periodParams({ from: '2026-10-20', to: '2026-11-18' })).toBe(
      '?from=2026-10-20&to=2026-11-18',
    );
    expect(periodParams({})).toBe('');
  });

  it('fetches each metric for the range in the URL, computed from the local date', async () => {
    const backend = mockAnalyticsBackend();
    const { result } = renderHook(
      () => {
        const { period } = useDashboardRange('2026-11-18');
        return useQuery(summaryQuery(period));
      },
      { wrapper: wrapperAt('/dashboard?range=30d') },
    );

    await waitFor(() => expect(result.current.data?.applied).toBe(32));
    expect(backend.requests).toEqual(['summary?from=2026-10-20&to=2026-11-18']);
  });

  it('passes null rates through for a new account', async () => {
    mockAnalyticsBackend(emptyAnalytics());
    const { result } = renderHook(() => useQuery(summaryQuery({})), { wrapper: wrapperAt() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ applied: 0, interview_rate: null });
  });

  it('changing the range keeps the old figures on screen until the new ones arrive', async () => {
    const backend = mockAnalyticsBackend();
    const { result } = renderHook(
      () => {
        const range = useDashboardRange('2026-11-18');
        return { range, series: useQuery(timeseriesQuery(range.period)) };
      },
      { wrapper: wrapperAt() },
    );
    await waitFor(() => expect(result.current.series.isSuccess).toBe(true));

    act(() => result.current.range.setRange('all'));

    expect(result.current.range.range).toBe('all');
    expect(result.current.series.data?.points).toHaveLength(13); // previous data, not undefined
    await waitFor(() => expect(backend.requests).toContain('timeseries'));
  });
});

describe('invalidation', () => {
  it('moving a card refreshes the analytics', async () => {
    const analytics = mockAnalyticsBackend();
    const applications = mockApplicationsBackend();
    const monzo = applications.applications.find((a) => a.company === 'Monzo');
    const { result } = renderHook(
      () => ({ summary: useQuery(summaryQuery({})), move: useMoveApplication() }),
      { wrapper: wrapperAt() },
    );
    await waitFor(() => expect(result.current.summary.isSuccess).toBe(true));
    expect(analytics.requests).toHaveLength(1);

    act(() =>
      result.current.move.mutate({ id: monzo?.id ?? '', status: 'interview', position: 4096 }),
    );

    await waitFor(() => expect(analytics.requests).toHaveLength(2));
  });
});

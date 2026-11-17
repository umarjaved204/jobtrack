import { type QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createQueryClient } from '@/lib/query-client';
import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server } from '@/test/msw';
import type { Board } from '@/types/application';

import {
  applicationKeys,
  applicationQuery,
  applicationsListQuery,
  boardQuery,
  eventsQuery,
  tagKeys,
  toSearchParams,
  useCreateTag,
  useDeleteApplication,
  useMoveApplication,
  useUpdateApplication,
} from './api';

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = createQueryClient();
  mockAuthBackend({ signedIn: true });
});

const boardData = () => queryClient.getQueryData<Board>(applicationKeys.board());

/** The move hook as the board page uses it: with the board query on screen (active). */
function useBoardWithMove() {
  useQuery(boardQuery());
  return useMoveApplication();
}
const columnOf = (board: Board | undefined, company: string) =>
  board?.columns.find((c) => c.applications.some((a) => a.company === company))?.status;
const idOf = (backend: ReturnType<typeof mockApplicationsBackend>, company: string) => {
  const app = backend.applications.find((a) => a.company === company);
  if (!app) throw new Error(`no ${company}`);
  return app.id;
};

describe('toSearchParams', () => {
  it('repeats array params and skips empty values', () => {
    expect(
      toSearchParams({
        q: 'monzo',
        status: ['applied', 'offer'],
        source: [],
        from: undefined,
        page: 2,
      }),
    ).toBe('?q=monzo&status=applied&status=offer&page=2');
    expect(toSearchParams({})).toBe('');
  });
});

describe('queries', () => {
  it('lists with filters', async () => {
    mockApplicationsBackend();
    const page = await queryClient.fetchQuery(
      applicationsListQuery({ status: ['applied'], sort: 'company' }),
    );
    expect(page.items.map((a) => a.company)).toEqual(['Monzo', 'Wise']);
    expect(page.total).toBe(2);
  });
});

describe('useMoveApplication (optimistic)', () => {
  it('moves the card at once, then refetches the board when the move settles', async () => {
    const backend = mockApplicationsBackend({ moveLatencyMs: 50 });
    await queryClient.fetchQuery(boardQuery());
    const { result } = renderHook(() => useBoardWithMove(), { wrapper });

    act(() =>
      result.current.mutate({ id: idOf(backend, 'Monzo'), status: 'screening', position: 512 }),
    );

    await waitFor(() => expect(columnOf(boardData(), 'Monzo')).toBe('screening')); // optimistic
    expect(backend.calls.filter((c) => c === 'GET /board')).toHaveLength(1); // not refetched yet

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(backend.calls.filter((c) => c === 'GET /board')).toHaveLength(2));
    expect(columnOf(boardData(), 'Monzo')).toBe('screening'); // server agrees
  });

  /*
   * The cases below check the board *while requests are in flight*: once everything
   * settles, the final refetch shows server truth whatever happened before, so asserting
   * only the end state can't tell a correct implementation from a broken one.
   */
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const boardFetches = (backend: ReturnType<typeof mockApplicationsBackend>) =>
    backend.calls.filter((c) => c === 'GET /board').length;

  it('two rapid moves: the first settling does not refetch over the second', async () => {
    const backend = mockApplicationsBackend({
      moveLatencyMs: (id) => (id === idOf(backend, 'Monzo') ? 30 : 250),
    });
    await queryClient.fetchQuery(boardQuery());
    const { result } = renderHook(() => useBoardWithMove(), { wrapper });

    act(() => {
      result.current.mutate({ id: idOf(backend, 'Monzo'), status: 'screening', position: 512 });
      result.current.mutate({ id: idOf(backend, 'Wise'), status: 'interview', position: 512 });
    });
    await sleep(120); // Monzo's move has settled; Wise's is still in flight

    // A refetch now would return Wise still in "applied" and visibly undo the drag.
    expect(boardFetches(backend)).toBe(1);
    expect(columnOf(boardData(), 'Monzo')).toBe('screening');
    expect(columnOf(boardData(), 'Wise')).toBe('interview');

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(boardFetches(backend)).toBe(2); // exactly one refetch, after the last move
    expect(columnOf(boardData(), 'Monzo')).toBe('screening');
    expect(columnOf(boardData(), 'Wise')).toBe('interview');
  });

  it('rolls back a failed move straight away (not only when the refetch lands)', async () => {
    const backend = mockApplicationsBackend({ boardLatencyMs: 300 });
    const monzo = idOf(backend, 'Monzo');
    backend.calls.length = 0;
    const before = await queryClient.fetchQuery(boardQuery());
    server.use(
      http.post(`/api/v1/applications/${monzo}/move`, () =>
        HttpResponse.json({ detail: 'Database unavailable' }, { status: 503 }),
      ),
    );
    const { result } = renderHook(() => useBoardWithMove(), { wrapper });

    act(() => result.current.mutate({ id: monzo, status: 'offer', position: 512 }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toMatchObject({ status: 503 });
    expect(queryClient.isFetching()).toBe(1); // the corrective refetch hasn't landed yet
    expect(boardData()).toEqual(before);
  });

  it('a failed move does not undo another move still in flight', async () => {
    const backend = mockApplicationsBackend({
      moveLatencyMs: (id) => (id === idOf(backend, 'Monzo') ? 20 : 250),
    });
    const monzo = idOf(backend, 'Monzo');
    server.use(
      http.post(`/api/v1/applications/${monzo}/move`, async () => {
        await sleep(20);
        return HttpResponse.json({ detail: 'Database unavailable' }, { status: 503 });
      }),
    );
    await queryClient.fetchQuery(boardQuery());
    const { result } = renderHook(() => useBoardWithMove(), { wrapper });

    act(() => {
      result.current.mutate({ id: monzo, status: 'offer', position: 512 });
      result.current.mutate({ id: idOf(backend, 'Wise'), status: 'interview', position: 512 });
    });
    await sleep(120); // Monzo's move has failed; Wise's is still in flight

    // Restoring Monzo's snapshot would also put Wise back in "applied".
    expect(columnOf(boardData(), 'Wise')).toBe('interview');

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(columnOf(boardData(), 'Monzo')).toBe('applied'); // server truth after the refetch
    expect(columnOf(boardData(), 'Wise')).toBe('interview');
  });

  it('cancels an in-flight board fetch so it cannot overwrite the move', async () => {
    // The move stays in flight longer than the stale fetch, so the move's own settle
    // refetch can't mask a missing cancel.
    const backend = mockApplicationsBackend({ moveLatencyMs: 300 });
    await queryClient.fetchQuery(boardQuery());
    // A slow refetch is on the wire (e.g. window refocus), carrying pre-move server state.
    let markStarted: () => void = () => undefined;
    const slowFetchStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    server.use(
      http.get(
        '/api/v1/applications/board',
        async () => {
          markStarted();
          await sleep(80);
          return HttpResponse.json({ columns: [] });
        },
        { once: true }, // later requests go to the fake again
      ),
    );
    const { result } = renderHook(() => useBoardWithMove(), { wrapper });
    void queryClient.refetchQueries({ queryKey: applicationKeys.board() });
    await slowFetchStarted; // really in flight, not just queued

    act(() =>
      result.current.mutate({ id: idOf(backend, 'Monzo'), status: 'screening', position: 512 }),
    );
    await waitFor(() => expect(columnOf(boardData(), 'Monzo')).toBe('screening'));
    await sleep(150); // the stale response has arrived; the move is still in flight

    expect(columnOf(boardData(), 'Monzo')).toBe('screening');
  });

  it('refreshes the detail, timeline and lists, since the status changed', async () => {
    const backend = mockApplicationsBackend();
    const id = idOf(backend, 'Monzo');
    await queryClient.fetchQuery(boardQuery());
    await queryClient.fetchQuery(applicationQuery(id));
    await queryClient.fetchQuery(eventsQuery(id));
    await queryClient.fetchQuery(applicationsListQuery({}));
    const { result } = renderHook(() => useBoardWithMove(), { wrapper });

    act(() => result.current.mutate({ id, status: 'interview', position: 512 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Inactive queries are marked stale (refetched when next shown).
    for (const key of [
      applicationKeys.detail(id),
      applicationKeys.events(id),
      applicationKeys.list({}),
    ]) {
      expect(queryClient.getQueryState(key)?.isInvalidated, String(key)).toBe(true);
    }
    const events = await queryClient.fetchQuery(eventsQuery(id));
    expect(events[0]).toMatchObject({ from_status: 'applied', to_status: 'interview' });
  });
});

describe('other mutations', () => {
  it('update: caches the result and invalidates the timeline', async () => {
    const backend = mockApplicationsBackend();
    const id = idOf(backend, 'Monzo');
    await queryClient.fetchQuery(eventsQuery(id));
    const { result } = renderHook(() => useUpdateApplication(id), { wrapper });

    act(() => result.current.mutate({ status: 'screening', location: 'Remote (UK)' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(applicationKeys.detail(id))).toMatchObject({
      status: 'screening',
      location: 'Remote (UK)',
    });
    expect(queryClient.getQueryState(applicationKeys.events(id))?.isInvalidated).toBe(true);
  });

  it('delete: forgets the application and its sub-queries', async () => {
    const backend = mockApplicationsBackend();
    const id = idOf(backend, 'Monzo');
    await queryClient.fetchQuery(applicationQuery(id));
    const { result } = renderHook(() => useDeleteApplication(), { wrapper });

    act(() => result.current.mutate(id));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(applicationKeys.detail(id))).toBeUndefined();
    expect(backend.applications.some((a) => a.id === id)).toBe(false);
  });

  it('create tag: adds it to the cached list in name order', async () => {
    mockApplicationsBackend({ tags: [{ id: 't1', name: 'Remote', color: 'cobalt' }] });
    queryClient.setQueryData(tagKeys.all, [{ id: 't1', name: 'Remote', color: 'cobalt' }]);
    const { result } = renderHook(() => useCreateTag(), { wrapper });

    act(() => result.current.mutate({ name: 'Fintech', color: 'plum' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData<{ name: string }[]>(tagKeys.all)?.map((t) => t.name)).toEqual([
      'Fintech',
      'Remote',
    ]);
  });
});

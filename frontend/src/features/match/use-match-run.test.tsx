import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { resumeKeys } from '@/features/resumes/api';
import { createQueryClient } from '@/lib/query-client';
import { makeResume, mockApplicationsBackend } from '@/test/fake-applications';
import { FakeEmbeddingClient } from '@/test/fake-embedding-client';
import { mockAuthBackend } from '@/test/msw';

import { matchKeys } from './api';
import { useMatchRun } from './use-match-run';

let queryClient: QueryClient;
let clients: FakeEmbeddingClient[];
let backend: ReturnType<typeof mockApplicationsBackend>;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const INPUT = { resume_id: 'resume-sam', jd_text: 'Frontend Engineer\n- React' };
const CLIENT = { embeddings: 'client' } as const;

/** `configure` sets up each fake worker client as the hook creates it. */
function renderRun(configure: (client: FakeEmbeddingClient, index: number) => void = () => {}) {
  return renderHook(
    () =>
      useMatchRun({
        createClient: () => {
          const client = new FakeEmbeddingClient();
          configure(client, clients.length);
          clients.push(client);
          return client;
        },
      }),
    { wrapper },
  );
}

beforeEach(() => {
  queryClient = createQueryClient();
  clients = [];
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend({
    resumes: [makeResume({ id: 'resume-sam', content_text: 'Sam Okafor\nReact developer' })],
  });
});

describe('useMatchRun', () => {
  it('runs to a result, caches it and refreshes history and resume counts', async () => {
    queryClient.setQueryData(matchKeys.list({}), { items: [] });
    queryClient.setQueryData(resumeKeys.list(), []);
    const { result } = renderRun();

    await act(() => result.current.start(INPUT, CLIENT));

    expect(result.current.state.status).toBe('done');
    const state = result.current.state;
    if (state.status !== 'done') throw new Error('not done');
    expect(queryClient.getQueryData(matchKeys.detail(state.match.id))).toEqual(state.match);
    expect(queryClient.getQueryState(matchKeys.list({}))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(resumeKeys.list())?.isInvalidated).toBe(true);
  });

  it('keeps one worker across runs', async () => {
    const { result } = renderRun();
    await act(() => result.current.start(INPUT, CLIENT));
    await act(() => result.current.start(INPUT, CLIENT));
    expect(clients).toHaveLength(1);
    expect(backend.matches).toHaveLength(2);
  });

  it('reports progress while running, and cancel stops the worker without saving', async () => {
    const { result } = renderRun((client) => (client.hold = true));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.start(INPUT, CLIENT);
    });
    await waitFor(() => expect(clients[0]).toBeDefined());
    const client = clients[0] as FakeEmbeddingClient;
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'running', progress: { phase: 'embedding' } }),
    ); // prettier-ignore

    act(() => result.current.cancel());
    await act(() => pending);

    expect(result.current.state.status).toBe('idle');
    expect(client.disposed).toBe(true);
    expect(backend.matches).toEqual([]);
  });

  it('shows a failure and starts a fresh worker next time', async () => {
    const { result } = renderRun((client, index) => {
      if (index === 0) client.failOn = { step: 'embed', reason: 'out-of-memory' };
    });
    await act(() => result.current.start(INPUT, CLIENT));
    expect(result.current.state.status).toBe('error');
    expect(result.current.state).toMatchObject({ message: expect.stringMatching(/memory/) });
    expect(clients[0]?.disposed).toBe(true);

    await act(() => result.current.start(INPUT, CLIENT));
    expect(clients).toHaveLength(2);
    expect(result.current.state.status).toBe('done');
  });

  it('shows API failures as the server words them', async () => {
    const { result } = renderRun();
    await act(() => result.current.start({ ...INPUT, resume_id: 'resume-gone' }, CLIENT));
    expect(result.current.state).toMatchObject({
      status: 'error',
      message: 'Resume version not found',
    });
  });

  it('stops the worker on unmount', async () => {
    const { result, unmount } = renderRun();
    await act(() => result.current.start(INPUT, CLIENT));
    unmount();
    expect(clients[0]?.disposed).toBe(true);
  });
});

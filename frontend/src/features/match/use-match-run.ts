import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sessionQueryOptions } from '@/features/auth/api';
import { resumeKeys } from '@/features/resumes/api';
import type { Match, MatchConfig, MatchInput } from '@/types/match';

import { matchKeys } from './api';
import {
  createEmbeddingClient,
  type EmbeddingClient,
  EmbeddingError,
} from './embedding/embedding-client';
import { matchFailureMessage, type MatchProgress, runMatch } from './run-match';
import { type ChunkVectorCache, createChunkVectorCache } from './vector-cache';

export type MatchRunState =
  | { status: 'idle' }
  | { status: 'running'; progress: MatchProgress }
  | { status: 'done'; match: Match }
  | { status: 'error'; error: unknown; message: string };

/*
 * Runs matches for a page. Owns the embedding worker: created on the first client-mode
 * run, kept between runs (the model stays loaded), and stopped on cancel, on an
 * embedding failure (so the next run starts clean) and on unmount.
 * A new result goes straight into the detail cache; the history and the resume usage
 * counts (a match freezes a resume's text) are refetched.
 * Chunk vectors from earlier matches come from this browser's cache, per signed-in user.
 */
export function useMatchRun({
  createClient = createEmbeddingClient,
  createVectors = (userId: string) => createChunkVectorCache({ userId }),
}: {
  createClient?: () => EmbeddingClient;
  createVectors?: (userId: string) => ChunkVectorCache;
} = {}) {
  const queryClient = useQueryClient();
  const userId = useQuery(sessionQueryOptions).data?.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new cache per user, not per render
  const vectors = useMemo(() => (userId ? createVectors(userId) : null), [userId]);
  const [state, setState] = useState<MatchRunState>({ status: 'idle' });
  const clientRef = useRef<EmbeddingClient | null>(null);
  const runRef = useRef<AbortController | null>(null);

  const stopWorker = useCallback(() => {
    clientRef.current?.dispose();
    clientRef.current = null;
  }, []);

  useEffect(
    () => () => {
      runRef.current?.abort();
      stopWorker();
    },
    [stopWorker],
  );

  const start = useCallback(
    async (input: MatchInput, config: Pick<MatchConfig, 'embeddings'>) => {
      runRef.current?.abort();
      const run = new AbortController();
      runRef.current = run;
      setState({ status: 'running', progress: { phase: 'preparing' } });
      try {
        const match = await runMatch(
          input,
          config,
          { embeddings: () => (clientRef.current ??= createClient()), vectors },
          {
            signal: run.signal,
            onProgress: (progress) => {
              if (!run.signal.aborted) setState({ status: 'running', progress });
            },
          },
        );
        if (run.signal.aborted) return;
        queryClient.setQueryData(matchKeys.detail(match.id), match);
        void queryClient.invalidateQueries({ queryKey: matchKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: resumeKeys.all });
        setState({ status: 'done', match });
      } catch (error) {
        if (run.signal.aborted) return;
        if (error instanceof EmbeddingError) stopWorker();
        const message = matchFailureMessage(error);
        setState(message ? { status: 'error', error, message } : { status: 'idle' });
      }
    },
    [createClient, queryClient, stopWorker, vectors],
  );

  /** Stops the run (and the worker, which may be mid-download or mid-embed). */
  const cancel = useCallback(() => {
    runRef.current?.abort();
    stopWorker();
    setState({ status: 'idle' });
  }, [stopWorker]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, cancel, reset };
}

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { resumeKeys } from '@/features/resumes/api';
import type { Match, MatchConfig, MatchInput } from '@/types/match';

import { matchKeys } from './api';
import {
  createEmbeddingClient,
  type EmbeddingClient,
  EmbeddingError,
} from './embedding/embedding-client';
import { matchFailureMessage, type MatchProgress, runMatch } from './run-match';

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
 */
export function useMatchRun({
  createClient = createEmbeddingClient,
}: { createClient?: () => EmbeddingClient } = {}) {
  const queryClient = useQueryClient();
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
          { embeddings: () => (clientRef.current ??= createClient()) },
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
    [createClient, queryClient, stopWorker],
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

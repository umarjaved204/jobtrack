import { api as defaultApi } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import type { Match, MatchConfig, MatchInput, MatchPrepared } from '@/types/match';

import { type EmbeddingClient, EmbeddingError } from './embedding/embedding-client';
import { encodeVectors } from './encode-vectors';

/*
 * One match, end to end (docs/architecture.md "Match API"):
 * - client mode: prepare (the server chunks both texts) → load the model in the worker
 *   (downloads on the first run, then from the browser cache) → embed every chunk in one
 *   call → POST /match with the vectors. A 409 means the texts changed since prepare
 *   (the resume was edited in another tab): prepare and embed once more, then give up.
 * - server mode: POST /match alone; the server embeds.
 * Framework-free and injectable; `use-match-run.ts` is the React side.
 */

export type MatchProgress =
  | { phase: 'preparing' }
  /** Bytes; `total` is 0 until the first progress event (or when loading from cache). */
  | { phase: 'loading-model'; loaded: number; total: number }
  /** Chunks embedded so far, JD and resume together. */
  | { phase: 'embedding'; done: number; total: number }
  | { phase: 'scoring' };

export type RunMatchDeps = {
  api?: Pick<typeof defaultApi, 'post'>;
  /** The worker client; called only in client mode, so server mode never spawns one. */
  embeddings: () => EmbeddingClient;
};

export type RunMatchOptions = {
  onProgress?: (progress: MatchProgress) => void;
  signal?: AbortSignal;
};

const MAX_ATTEMPTS = 2;

export async function runMatch(
  input: MatchInput,
  config: Pick<MatchConfig, 'embeddings'>,
  { api = defaultApi, embeddings }: RunMatchDeps,
  { onProgress = () => {}, signal }: RunMatchOptions = {},
): Promise<Match> {
  const body = {
    resume_id: input.resume_id,
    jd_text: input.jd_text,
    application_id: input.application_id ?? null,
  };

  if (config.embeddings === 'off') {
    throw new Error('Matching is switched off on this server.');
  }
  if (config.embeddings === 'server') {
    onProgress({ phase: 'scoring' });
    return api.post<Match>('/match', body, { signal });
  }

  for (let attempt = 1; ; attempt++) {
    onProgress({ phase: 'preparing' });
    const prepared = await api.post<MatchPrepared>(
      '/match/prepare',
      { resume_id: body.resume_id, jd_text: body.jd_text },
      { signal },
    );

    const client = embeddings();
    onProgress({ phase: 'loading-model', loaded: 0, total: 0 });
    await client.load(prepared.model, (loaded, total) =>
      onProgress({ phase: 'loading-model', loaded, total }),
    );
    signal?.throwIfAborted();

    const texts = [...prepared.jd_chunks, ...prepared.resume_chunks];
    onProgress({ phase: 'embedding', done: 0, total: texts.length });
    const rows = await client.embed(texts, {
      onProgress: (done, total) => onProgress({ phase: 'embedding', done, total }),
    });
    signal?.throwIfAborted();

    const split = prepared.jd_chunks.length;
    const { dim } = prepared.model;
    onProgress({ phase: 'scoring' });
    try {
      return await api.post<Match>(
        '/match',
        {
          ...body,
          embeddings: {
            digest: prepared.digest,
            jd: encodeVectors(rows.slice(0, split), dim),
            resume: encodeVectors(rows.slice(split), dim),
          },
        },
        { signal },
      );
    } catch (error) {
      if (isApiError(error) && error.status === 409 && attempt < MAX_ATTEMPTS) continue;
      throw error;
    }
  }
}

/** By name: fetch, AbortSignal and jsdom don't all share one DOMException class. */
export const isAbort = (error: unknown) =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

const EMBEDDING_MESSAGES: Record<EmbeddingError['reason'], string> = {
  unsupported: 'This browser can’t run the match model.',
  'download-failed': 'The match model couldn’t download. Check your connection and try again.',
  'out-of-memory':
    'This device ran out of memory running the model. Close some tabs and try again, or use a computer.',
  failed: 'The match model stopped unexpectedly. Try again.',
};

/** What to tell the user, or null for a cancelled run. */
export function matchFailureMessage(error: unknown): string | null {
  if (isAbort(error)) return null;
  if (error instanceof EmbeddingError) {
    const base = EMBEDDING_MESSAGES[error.reason];
    return error.reason === 'unsupported' ? `${base} ${error.message}` : base;
  }
  if (isApiError(error)) {
    if (error.status === 429) {
      const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
      return `You’ve run a lot of matches this hour. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
    }
    if (error.status === 409) {
      return 'The resume changed while the match ran. Try again.';
    }
    return error.detail;
  }
  return 'Something went wrong. Please try again.';
}

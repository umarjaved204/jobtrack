import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/errors';
import { makeResume, mockApplicationsBackend } from '@/test/fake-applications';
import { FakeEmbeddingClient } from '@/test/fake-embedding-client';
import { mockAuthBackend, server } from '@/test/msw';
import type { EmbeddingsMode } from '@/types/match';

import { EmbeddingError } from './embedding/embedding-client';
import { decodeVectors } from './encode-vectors';
import { isAbort, matchFailureMessage, type MatchProgress, runMatch } from './run-match';

const RESUME = 'Sam Okafor\nFrontend engineer\n- React, TypeScript, Playwright';
const JD = 'Senior Frontend Engineer, Monzo\nRequirements:\n- React and TypeScript';
const INPUT = { resume_id: 'resume-sam', jd_text: JD };

let backend: ReturnType<typeof mockApplicationsBackend>;
let client: FakeEmbeddingClient;

function setup(mode: EmbeddingsMode = 'client') {
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend({
    resumes: [makeResume({ id: 'resume-sam', content_text: RESUME })],
    matchEmbeddings: mode,
  });
  client = new FakeEmbeddingClient();
}

const run = (mode: EmbeddingsMode = 'client', onProgress?: (p: MatchProgress) => void) =>
  runMatch(INPUT, { embeddings: mode }, { embeddings: () => client }, { onProgress });

/** The POST /match bodies the backend received. */
function captureMatchBodies() {
  const bodies: Record<string, unknown>[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/v1/match') {
      void request
        .clone()
        .json()
        .then((body) => bodies.push(body as Record<string, unknown>));
    }
  });
  return bodies;
}

beforeEach(() => setup());

describe('runMatch in client mode', () => {
  it('prepares, loads the model, embeds every chunk once and saves the result', async () => {
    const progress: MatchProgress[] = [];
    const match = await run('client', (p) => progress.push(p));

    expect(match.resume_version_id).toBe('resume-sam');
    expect(backend.calls.filter((c) => c.startsWith('POST /match'))).toEqual([
      'POST /match/prepare',
      'POST /match',
    ]);
    expect(client.loads).toHaveLength(1);
    // JD chunks first, then the resume's, in one call.
    expect(client.embedded).toEqual([
      [
        'Senior Frontend Engineer, Monzo',
        'Requirements:',
        'React and TypeScript',
        'Sam Okafor',
        'Frontend engineer',
        'React, TypeScript, Playwright',
      ],
    ]);
    expect(progress.map((p) => p.phase)).toEqual([
      'preparing',
      'loading-model',
      'loading-model',
      'loading-model',
      'embedding',
      'embedding',
      'scoring',
    ]);
    expect(progress[3]).toEqual({ phase: 'loading-model', loaded: 34e6, total: 34e6 });
  });

  it('sends the JD and resume vectors separately, one row per chunk', async () => {
    const bodies = captureMatchBodies();
    await run();
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    const embeddings = bodies[0]?.['embeddings'] as { jd: string; resume: string };
    expect(decodeVectors(embeddings.jd, 384)).toHaveLength(3);
    expect(decodeVectors(embeddings.resume, 384)).toHaveLength(3);
    expect(bodies[0]?.['application_id']).toBeNull();
  });

  it('prepares again once when the texts changed since prepare', async () => {
    let conflicts = 1;
    server.use(
      http.post('/api/v1/match', () => {
        if (conflicts-- > 0) return HttpResponse.json({ detail: 'changed' }, { status: 409 });
        return undefined; // fall through to the fake backend
      }),
    );
    await run();
    expect(backend.calls.filter((c) => c === 'POST /match/prepare')).toHaveLength(2);
    expect(client.loads).toHaveLength(2); // a no-op once loaded, in the real client
  });

  it('gives up after a second conflict', async () => {
    server.use(
      http.post('/api/v1/match', () => HttpResponse.json({ detail: 'changed' }, { status: 409 })),
    );
    await expect(run()).rejects.toMatchObject({ status: 409 });
    expect(backend.calls.filter((c) => c === 'POST /match/prepare')).toHaveLength(2);
  });

  it('stops before saving when aborted during embedding', async () => {
    const controller = new AbortController();
    client.hold = true;
    const pending = runMatch(
      INPUT,
      { embeddings: 'client' },
      { embeddings: () => client },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(client.embedded).toHaveLength(1));
    controller.abort();
    client.release();
    const error: unknown = await pending.catch((e: unknown) => e);
    expect(isAbort(error)).toBe(true);
    expect(backend.calls).not.toContain('POST /match');
  });

  it('passes embedding failures through', async () => {
    client.failOn = { step: 'load', reason: 'download-failed' };
    await expect(run()).rejects.toBeInstanceOf(EmbeddingError);
    expect(backend.calls).not.toContain('POST /match');
  });
});

describe('runMatch in other modes', () => {
  it('lets the server embed in server mode', async () => {
    setup('server');
    const progress: MatchProgress[] = [];
    await run('server', (p) => progress.push(p));
    expect(backend.calls.filter((c) => c.startsWith('POST /match'))).toEqual(['POST /match']);
    expect(client.loads).toEqual([]);
    expect(progress).toEqual([{ phase: 'scoring' }]);
  });

  it('refuses to run when matching is off', async () => {
    await expect(run('off')).rejects.toThrow(/switched off/);
    expect(backend.calls).toEqual([]);
  });
});

describe('matchFailureMessage', () => {
  it('stays quiet for a cancelled run', () => {
    expect(matchFailureMessage(new DOMException('Aborted', 'AbortError'))).toBeNull();
  });

  it('explains embedding failures, with the browser’s missing feature', () => {
    expect(matchFailureMessage(new EmbeddingError('unsupported', 'No WebAssembly SIMD.'))).toBe(
      'This browser can’t run the match model. No WebAssembly SIMD.',
    );
    expect(matchFailureMessage(new EmbeddingError('out-of-memory', 'x'))).toMatch(/memory/);
    expect(matchFailureMessage(new EmbeddingError('download-failed', 'x'))).toMatch(/download/);
  });

  it('turns the rate limit into minutes', () => {
    const limited = new ApiError(429, 'Too many', { retryAfterSeconds: 61 });
    expect(matchFailureMessage(limited)).toBe(
      'You’ve run a lot of matches this hour. Try again in 2 minutes.',
    );
    expect(matchFailureMessage(new ApiError(429, 'x', { retryAfterSeconds: 5 }))).toMatch(
      /1 minute\.$/,
    );
  });

  it('shows the server’s own message otherwise', () => {
    expect(matchFailureMessage(new ApiError(503, 'Matching is switched off on this server'))).toBe(
      'Matching is switched off on this server',
    );
    expect(matchFailureMessage(new ApiError(409, 'changed'))).toMatch(/resume changed/);
    expect(matchFailureMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});

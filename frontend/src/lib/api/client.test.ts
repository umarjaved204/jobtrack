import { describe, expect, it, vi } from 'vitest';

import type { AuthResponse } from '@/types/auth';

import { createApiClient } from './client';
import { ApiError } from './errors';

const json = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const refreshed = (token: string) => ({ access_token: token }) as AuthResponse;

/** A session stub: the real one is covered in session.test.ts. */
function fakeSession(token: string | null = 'at-1', { stale = false } = {}) {
  let current = token;
  let needsRefresh = stale || token === null;
  return {
    getAccessToken: vi.fn(() => current),
    needsRefresh: vi.fn(() => needsRefresh),
    refresh: vi.fn(async (): Promise<AuthResponse | null> => {
      current = 'at-2';
      needsRefresh = false;
      return refreshed('at-2');
    }),
    end: vi.fn(),
  };
}

const authHeader = (fetch: ReturnType<typeof vi.fn>, call: number) =>
  (fetch.mock.calls[call]?.[1] as RequestInit | undefined)?.headers as Record<string, string>;

describe('api client: authenticated requests', () => {
  it('sends JSON with the bearer token to /api/v1', async () => {
    const fetch = vi.fn().mockResolvedValue(json(201, { id: 'app-1' }));
    const api = createApiClient({ session: fakeSession(), fetch });

    const result = await api.post<{ id: string }>('/applications', { company: 'Monzo' });

    expect(result).toEqual({ id: 'app-1' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/applications');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"company":"Monzo"}');
    expect(init.credentials).toBe('same-origin');
    expect(authHeader(fetch, 0)).toMatchObject({
      Authorization: 'Bearer at-1',
      'Content-Type': 'application/json',
    });
  });

  it('refreshes first when the token is about to expire', async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, []));
    const session = fakeSession('at-1', { stale: true });
    await createApiClient({ session, fetch }).get('/tags');

    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(authHeader(fetch, 0)['Authorization']).toBe('Bearer at-2');
  });

  it('on a 401, refreshes once and retries once with the new token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(401, { detail: 'Could not validate credentials' }))
      .mockResolvedValueOnce(json(200, { total: 3 }));
    const session = fakeSession();

    const result = await createApiClient({ session, fetch }).get('/analytics/summary');

    expect(result).toEqual({ total: 3 });
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(authHeader(fetch, 1)['Authorization']).toBe('Bearer at-2');
    expect(session.end).not.toHaveBeenCalled();
  });

  it('reuses a token another request already refreshed instead of refreshing again', async () => {
    const session = fakeSession();
    const fetch = vi
      .fn()
      // While this request was in flight, a parallel one refreshed the token.
      .mockImplementationOnce(async () => {
        session.getAccessToken.mockReturnValue('at-from-elsewhere');
        return json(401, { detail: 'expired' });
      })
      .mockResolvedValueOnce(json(200, {}));

    await createApiClient({ session, fetch }).get('/tags');

    expect(session.refresh).not.toHaveBeenCalled();
    expect(authHeader(fetch, 1)['Authorization']).toBe('Bearer at-from-elsewhere');
  });

  it('ends the session if the refresh fails', async () => {
    const fetch = vi.fn().mockResolvedValue(json(401, { detail: 'expired' }));
    const session = fakeSession();
    session.refresh.mockResolvedValue(null);

    await expect(createApiClient({ session, fetch }).get('/tags')).rejects.toMatchObject({
      status: 401,
    });
    expect(session.end).toHaveBeenCalledWith('expired');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry (no loops) and ends the session', async () => {
    const fetch = vi.fn().mockResolvedValue(json(401, { detail: 'nope' }));
    const session = fakeSession();

    await expect(createApiClient({ session, fetch }).get('/tags')).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(session.end).toHaveBeenCalledWith('expired');
  });

  it('does not end the session when the refresh hits a network error', async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, {}));
    const session = fakeSession(null);
    session.refresh.mockRejectedValue(ApiError.network());

    await expect(createApiClient({ session, fetch }).get('/tags')).rejects.toMatchObject({
      status: 0,
    });
    expect(session.end).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('api client: auth endpoints', () => {
  it.each(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'])(
    '%s: no bearer token and no refresh-and-retry on 401',
    async (path) => {
      const fetch = vi.fn().mockResolvedValue(json(401, { detail: 'Incorrect email or password' }));
      const session = fakeSession();

      const error = await createApiClient({ session, fetch })
        .post(path, { email: 'sam@example.com', password: 'wrong' })
        .catch((e: unknown) => e);

      expect(error).toMatchObject({ status: 401, detail: 'Incorrect email or password' });
      expect(authHeader(fetch, 0)['Authorization']).toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(session.refresh).not.toHaveBeenCalled();
      expect(session.end).not.toHaveBeenCalled();
    },
  );
});

describe('api client: responses', () => {
  it('returns undefined for 204 No Content', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await createApiClient({ session: fakeSession(), fetch }).delete('/tags/t-1')).toBe(
      undefined,
    );
  });

  it('maps a network failure to status 0', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      createApiClient({ session: fakeSession(), fetch }).get('/tags'),
    ).rejects.toMatchObject({ status: 0 });
  });

  it('lets aborts through untouched', async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      createApiClient({ session: fakeSession(), fetch }).get('/tags'),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

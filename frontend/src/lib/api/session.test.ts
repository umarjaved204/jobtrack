import { describe, expect, it, vi } from 'vitest';

import type { AuthResponse } from '@/types/auth';

import { ApiError } from './errors';
import {
  type AuthChannel,
  createSessionManager,
  type LockManagerLike,
  NO_REFRESH_COOKIE_DETAIL,
  RACE_RETRY_DELAY_MS,
  REFRESH_LOCK_NAME,
  type SessionDeps,
} from './session';

// ---------------------------------------------------------------- fakes

const SESSION_EXPIRED = 'Session expired, please log in again'; // backend INVALID_REFRESH

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const authBody = (accessToken: string, expiresIn = 900): AuthResponse => ({
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: expiresIn,
  user: {
    id: 'u-1',
    email: 'sam.okafor@example.com',
    full_name: 'Sam Okafor',
    theme: 'system',
    accent: 'vermilion',
    created_at: '2026-11-01T09:30:00Z',
  },
});

/** Lets other pending promises run, like network latency would. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * A browser cookie jar plus the backend's refresh rules: rotate on a current token;
 * 401 *without* touching the jar for a just-rotated one (grace window); 401 for anything
 * else. The cookie is read when the request is SENT, so concurrent requests can race.
 */
function createFakeBackend(
  initialCookie: string | null = 'rt-1',
  { valid = true }: { valid?: boolean } = {},
) {
  let version = 1;
  // An invalid cookie (revoked/expired) is simply one the backend doesn't hold as current.
  let current = valid ? initialCookie : 'rt-server-side';
  let previous: string | null = null;
  const jar = { cookie: initialCookie };
  const statuses: number[] = [];

  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const presented = jar.cookie;
    await tick();
    let response: Response;
    if (presented === null) {
      response = json(401, { detail: NO_REFRESH_COOKIE_DETAIL });
    } else if (presented === current) {
      version += 1;
      previous = current;
      current = `rt-${version}`;
      jar.cookie = current;
      response = json(200, authBody(`at-${version}`));
    } else {
      response = json(401, { detail: SESSION_EXPIRED }); // race (=previous) or dead token
    }
    statuses.push(response.status);
    return response;
  });

  return { fetch, jar, statuses, previous: () => previous };
}

/** Serialises callbacks per lock name, like navigator.locks (exclusive mode). */
function createFakeLocks(): LockManagerLike & { names: string[] } {
  const tails = new Map<string, Promise<unknown>>();
  const names: string[] = [];
  return {
    names,
    request<T>(name: string, callback: () => Promise<T>) {
      names.push(name);
      const run = (tails.get(name) ?? Promise.resolve()).then(callback);
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}

/** In-memory BroadcastChannel: delivers to every other subscriber. */
function createChannelHub() {
  const subscribers = new Set<(message: unknown) => void>();
  return (): AuthChannel => {
    let own: ((message: unknown) => void) | null = null;
    return {
      postMessage: (message) =>
        subscribers.forEach((handler) => {
          if (handler !== own) handler(structuredClone(message));
        }),
      subscribe: (handler) => {
        own = handler;
        subscribers.add(handler);
      },
    };
  };
}

function makeDeps(overrides: Partial<SessionDeps> = {}) {
  let clock = 0;
  const timers: { callback: () => void; ms: number }[] = [];
  const deps: SessionDeps = {
    fetch: vi.fn(),
    locks: null,
    channel: null,
    now: () => clock,
    sleep: vi.fn(async () => undefined),
    setTimer: (callback, ms) => timers.push({ callback, ms }) - 1,
    clearTimer: (handle) => {
      const timer = timers[handle as number];
      if (timer) timer.callback = () => undefined;
    },
    ...overrides,
  };
  return {
    deps,
    timers,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

// ---------------------------------------------------------------- tests

describe('session: token lifetime', () => {
  it('keeps the token in memory and plans a refresh 60 s before expiry', () => {
    const { deps, timers, advance } = makeDeps();
    const session = createSessionManager(deps);

    session.start(authBody('at-1', 900));

    expect(session.getAccessToken()).toBe('at-1');
    expect(timers.at(-1)?.ms).toBe(840_000); // 900 s - 60 s, from when the response arrived
    expect(session.needsRefresh()).toBe(false);
    advance(839_999);
    expect(session.needsRefresh()).toBe(false);
    advance(1);
    expect(session.needsRefresh()).toBe(true);
  });

  it('uses a quarter of the lifetime as margin for short-lived tokens', () => {
    const { deps, timers } = makeDeps();
    createSessionManager(deps).start(authBody('at-1', 60));
    expect(timers.at(-1)?.ms).toBe(45_000);
  });

  it('refreshes proactively when the timer fires', async () => {
    const backend = createFakeBackend();
    const { deps, timers } = makeDeps({ fetch: backend.fetch });
    const session = createSessionManager(deps);
    session.start(authBody('at-1'));

    timers.at(-1)?.callback();
    await vi.waitFor(() => expect(session.getAccessToken()).toBe('at-2'));
  });

  it('signs out when the proactive refresh finds the session dead', async () => {
    const backend = createFakeBackend('rt-revoked', { valid: false });
    const { deps, timers } = makeDeps({ fetch: backend.fetch });
    const session = createSessionManager(deps);
    const onSignedOut = vi.fn();
    session.onSignedOut(onSignedOut);
    session.start(authBody('at-1'));

    timers.at(-1)?.callback();
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledWith('expired'));
    expect(session.getAccessToken()).toBeNull();
  });
});

describe('session: refresh outcomes', () => {
  it('returns the new session (token + user) from a single call', async () => {
    const backend = createFakeBackend();
    const { deps } = makeDeps({ fetch: backend.fetch });
    const session = createSessionManager(deps);

    const result = await session.refresh();

    expect(result?.user.full_name).toBe('Sam Okafor');
    expect(session.getAccessToken()).toBe('at-2');
    expect(backend.fetch).toHaveBeenCalledTimes(1);
    expect(backend.fetch.mock.calls[0]?.[0]).toBe('/api/v1/auth/refresh');
  });

  it('treats "no cookie" as anonymous at once, without the retry delay', async () => {
    const backend = createFakeBackend(null);
    const { deps } = makeDeps({ fetch: backend.fetch });

    expect(await createSessionManager(deps).refresh()).toBeNull();
    expect(backend.fetch).toHaveBeenCalledTimes(1);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('retries a rejected refresh exactly once before giving up', async () => {
    const backend = createFakeBackend('rt-revoked', { valid: false });
    const { deps } = makeDeps({ fetch: backend.fetch });

    expect(await createSessionManager(deps).refresh()).toBeNull();
    expect(backend.fetch).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledTimes(1);
    expect(deps.sleep).toHaveBeenCalledWith(RACE_RETRY_DELAY_MS);
  });

  it('recovers when the retry succeeds (lost a race to another tab)', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(401, { detail: SESSION_EXPIRED }))
      .mockResolvedValueOnce(json(200, authBody('at-from-retry')));
    const { deps } = makeDeps({ fetch });

    const result = await createSessionManager(deps).refresh();
    expect(result?.access_token).toBe('at-from-retry');
  });

  it('throws (does not sign out) on server or network errors', async () => {
    const { deps } = makeDeps({ fetch: vi.fn().mockResolvedValue(json(503, {})) });
    const session = createSessionManager(deps);
    session.start(authBody('at-1'));

    await expect(session.refresh()).rejects.toMatchObject({ status: 503 });
    expect(session.getAccessToken()).toBe('at-1');

    deps.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const offline = createSessionManager(deps);
    await expect(offline.refresh()).rejects.toBeInstanceOf(ApiError);
  });

  it('shares one request between concurrent refreshes in the same tab', async () => {
    const backend = createFakeBackend();
    const { deps } = makeDeps({ fetch: backend.fetch });
    const session = createSessionManager(deps);

    const [a, b] = await Promise.all([session.refresh(), session.refresh()]);
    expect(a).toBe(b);
    expect(backend.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('session: two tabs sharing one cookie jar', () => {
  it('with Web Locks, refreshes are serialised and both tabs succeed with no 401s', async () => {
    const backend = createFakeBackend();
    const locks = createFakeLocks();
    const tabA = createSessionManager(makeDeps({ fetch: backend.fetch, locks }).deps);
    const tabB = createSessionManager(makeDeps({ fetch: backend.fetch, locks }).deps);

    const [a, b] = await Promise.all([tabA.refresh(), tabB.refresh()]);

    expect(a?.access_token).toBe('at-2');
    expect(b?.access_token).toBe('at-3'); // B waited, then rotated A's new cookie
    expect(backend.statuses).toEqual([200, 200]);
    expect(locks.names).toEqual([REFRESH_LOCK_NAME, REFRESH_LOCK_NAME]);
  });

  it('without Web Locks, the tab that loses the race recovers via the single retry', async () => {
    const backend = createFakeBackend();
    const depsA = makeDeps({ fetch: backend.fetch }).deps;
    const depsB = makeDeps({ fetch: backend.fetch }).deps;
    const tabA = createSessionManager(depsA);
    const tabB = createSessionManager(depsB);

    const [a, b] = await Promise.all([tabA.refresh(), tabB.refresh()]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Both sent rt-1; one rotated it, the other hit the grace-window 401, waited, retried.
    expect(backend.statuses).toEqual([200, 401, 200]);
    expect(depsB.sleep).toHaveBeenCalledWith(RACE_RETRY_DELAY_MS);
  });
});

describe('session: sign-out', () => {
  it('clears the token, notifies listeners and broadcasts to other tabs', () => {
    const hub = createChannelHub();
    const tabA = createSessionManager(makeDeps({ channel: hub() }).deps);
    const tabB = createSessionManager(makeDeps({ channel: hub() }).deps);
    const onA = vi.fn();
    const onB = vi.fn();
    tabA.onSignedOut(onA);
    tabB.onSignedOut(onB);
    tabA.start(authBody('at-a'));
    tabB.start(authBody('at-b'));

    tabA.end('logout');

    expect(tabA.getAccessToken()).toBeNull();
    expect(tabB.getAccessToken()).toBeNull();
    expect(onA).toHaveBeenCalledWith('logout');
    expect(onB).toHaveBeenCalledWith('logout');
  });

  it('ignores a broadcast in a tab that was not signed in', () => {
    const hub = createChannelHub();
    const tabA = createSessionManager(makeDeps({ channel: hub() }).deps);
    const anonymousTab = createSessionManager(makeDeps({ channel: hub() }).deps);
    const onAnonymous = vi.fn();
    anonymousTab.onSignedOut(onAnonymous);
    tabA.start(authBody('at-a'));

    tabA.end('logout');
    expect(onAnonymous).not.toHaveBeenCalled();
  });

  it('cancels the proactive refresh on sign-out', () => {
    const { deps, timers } = makeDeps({ fetch: vi.fn() });
    const session = createSessionManager(deps);
    session.start(authBody('at-1'));
    session.end('logout');

    timers.at(-1)?.callback();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('ignores malformed channel messages', () => {
    const hub = createChannelHub();
    const tab = createSessionManager(makeDeps({ channel: hub() }).deps);
    tab.start(authBody('at-1'));

    hub().postMessage({ type: 'signed-out', reason: 'because' } as never);
    expect(tab.getAccessToken()).toBe('at-1');
  });
});

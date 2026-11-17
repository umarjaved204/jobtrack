import type { AuthResponse } from '@/types/auth';

import { ApiError } from './errors';

/*
 * Access-token session for one tab (design: docs/adr/0002-authentication.md).
 *
 * - The access token lives only in memory here. The refresh token is an httpOnly cookie
 *   (Path=/api/v1/auth) that JavaScript never sees; the browser sends it to /auth/refresh.
 * - Every refresh rotates that cookie. Tabs share the cookie jar, so refreshes are
 *   serialised across tabs with a Web Lock: a tab that waited then presents the cookie the
 *   previous holder just stored, and the rotation succeeds.
 * - Without Web Locks (insecure context such as a LAN IP over http, or an old browser),
 *   two tabs can race. The loser gets a 401 inside the backend's grace window, which looks
 *   exactly like a dead session, so any 401 other than "no cookie" is retried once after
 *   RACE_RETRY_DELAY_MS, by which time the winner's cookie is in the jar.
 * - Signing out (here or in another tab, via BroadcastChannel) notifies listeners so the
 *   app can clear cached data and leave protected pages.
 */

export const API_BASE = '/api/v1';
export const REFRESH_LOCK_NAME = 'jobtrack:auth-refresh';
export const AUTH_CHANNEL_NAME = 'jobtrack:auth';

/** Backend detail for a refresh without any cookie (backend/app/api/v1/auth.py). */
export const NO_REFRESH_COOKIE_DETAIL = 'Not authenticated';
/** Pause before the single retry of a rejected refresh (see the race note above). */
export const RACE_RETRY_DELAY_MS = 400;
/** Refresh this long before the access token expires (capped at 1/4 of its lifetime). */
export const MAX_REFRESH_MARGIN_MS = 60_000;

export type SignOutReason = 'logout' | 'expired';
type SignOutListener = (reason: SignOutReason) => void;
type AuthMessage = { type: 'signed-out'; reason: SignOutReason };

/** The subset of `navigator.locks` we use. */
export type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

/** Minimal cross-tab channel; in the browser, a BroadcastChannel adapter. */
export type AuthChannel = {
  postMessage(message: AuthMessage): void;
  subscribe(handler: (message: unknown) => void): void;
};

export type SessionDeps = {
  fetch: typeof globalThis.fetch;
  locks: LockManagerLike | null;
  channel: AuthChannel | null;
  /** Monotonic milliseconds (performance.now in the browser). */
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export type SessionManager = ReturnType<typeof createSessionManager>;

type RefreshAttempt =
  | { kind: 'ok'; data: AuthResponse }
  | { kind: 'anonymous' } // no refresh cookie at all: definitely signed out
  | { kind: 'rejected' }; // 401 with a cookie: dead session OR a lost race (indistinguishable)

const isSignOutMessage = (m: unknown): m is AuthMessage =>
  typeof m === 'object' &&
  m !== null &&
  (m as AuthMessage).type === 'signed-out' &&
  ((m as AuthMessage).reason === 'logout' || (m as AuthMessage).reason === 'expired');

export function createSessionManager(deps: SessionDeps) {
  let current: { accessToken: string; refreshAt: number } | null = null;
  let timer: unknown = null;
  let inFlight: Promise<AuthResponse | null> | null = null;
  const listeners = new Set<SignOutListener>();

  function clearTimer() {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  }

  /** Store a fresh access token (from login, register or refresh) and plan its renewal. */
  function start(response: AuthResponse) {
    const lifetimeMs = response.expires_in * 1000;
    const marginMs = Math.min(MAX_REFRESH_MARGIN_MS, lifetimeMs / 4);
    // Timed from when the response arrived, on a monotonic clock: no JWT parsing, and
    // immune to the device clock being wrong or changing.
    current = { accessToken: response.access_token, refreshAt: deps.now() + lifetimeMs - marginMs };
    clearTimer();
    timer = deps.setTimer(onRefreshTimer, lifetimeMs - marginMs);
  }

  function onRefreshTimer() {
    timer = null;
    refresh().then(
      (result) => {
        if (!result) end('expired');
      },
      () => {
        // Network/server error: keep the session; the next API call retries the refresh.
      },
    );
  }

  async function attemptRefresh(): Promise<RefreshAttempt> {
    let response: Response;
    try {
      response = await deps.fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw ApiError.network();
    }
    if (response.ok) return { kind: 'ok', data: (await response.json()) as AuthResponse };
    if (response.status === 401) {
      const error = await ApiError.fromResponse(response);
      return error.detail === NO_REFRESH_COOKIE_DETAIL
        ? { kind: 'anonymous' }
        : { kind: 'rejected' };
    }
    throw await ApiError.fromResponse(response);
  }

  async function refreshOnce(): Promise<AuthResponse | null> {
    let attempt = await attemptRefresh();
    if (attempt.kind === 'rejected') {
      await deps.sleep(RACE_RETRY_DELAY_MS);
      attempt = await attemptRefresh();
    }
    if (attempt.kind === 'ok') {
      start(attempt.data);
      return attempt.data;
    }
    return null;
  }

  /**
   * Swap the refresh cookie for a new access token. Resolves to the auth response, or
   * `null` when there is no valid session (the caller decides whether that is "anonymous"
   * or "expired"). Rejects with ApiError on network/server errors, which are NOT sign-outs.
   * Concurrent calls in this tab share one request; other tabs wait on the Web Lock.
   */
  function refresh(): Promise<AuthResponse | null> {
    inFlight ??= (
      deps.locks ? deps.locks.request(REFRESH_LOCK_NAME, refreshOnce) : refreshOnce()
    ).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function signOutLocally(reason: SignOutReason, notifyEvenIfAnonymous: boolean) {
    const hadSession = current !== null;
    current = null;
    clearTimer();
    if (hadSession || notifyEvenIfAnonymous) listeners.forEach((listener) => listener(reason));
  }

  /** Forget the access token and tell listeners (and other tabs) the user is signed out. */
  function end(reason: SignOutReason) {
    signOutLocally(reason, reason === 'logout');
    deps.channel?.postMessage({ type: 'signed-out', reason });
  }

  // Another tab signed out. Only tabs that were signed in react (no bouncing anonymous
  // visitors on the landing page to /login).
  deps.channel?.subscribe((message) => {
    if (isSignOutMessage(message)) signOutLocally(message.reason, false);
  });

  return {
    start,
    refresh,
    end,
    getAccessToken: () => current?.accessToken ?? null,
    /** True when there is no token, or it is within the refresh margin of expiring. */
    needsRefresh: () => current === null || deps.now() >= current.refreshAt,
    onSignedOut(listener: SignOutListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Tests only: forget the token, timer and listeners without notifying anyone. */
    reset() {
      current = null;
      inFlight = null;
      clearTimer();
      listeners.clear();
    },
  };
}

function browserAuthChannel(): AuthChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  return {
    postMessage: (message) => channel.postMessage(message),
    subscribe: (handler) =>
      channel.addEventListener('message', (event: MessageEvent<unknown>) => handler(event.data)),
  };
}

/** Web Locks exist only in secure contexts (HTTPS, localhost); otherwise use the fallback. */
function browserLocks(): LockManagerLike | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator) || !navigator.locks) return null;
  const locks = navigator.locks;
  return { request: (name, callback) => locks.request(name, callback) };
}

/** The app's session (one per tab). */
export const session = createSessionManager({
  fetch: (...args) => globalThis.fetch(...args),
  locks: browserLocks(),
  channel: browserAuthChannel(),
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

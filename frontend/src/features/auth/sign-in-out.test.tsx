import { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it, vi } from 'vitest';

import { type AuthChannel, createSessionManager, session } from '@/lib/api/session';
import { authResponse, mockAuthBackend, server, TEST_PASSWORD, testUser } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

import { signIn, signOut, signUp } from './api';
import { installSignOutHandler } from './sign-out-handler';

describe('signIn / signUp', () => {
  it('signs in: token in memory, user cached, profile theme applied', async () => {
    mockAuthBackend({ user: { ...testUser, theme: 'dark' } });
    const queryClient = new QueryClient();

    const user = await signIn(queryClient, { email: testUser.email, password: TEST_PASSWORD });

    expect(user.full_name).toBe('Sam Okafor');
    expect(session.getAccessToken()).toBe('at-login');
    expect(queryClient.getQueryData(['session'])).toEqual(user);
    expect(document.documentElement).toHaveClass('dark');
  });

  it('reports wrong credentials without touching the session', async () => {
    mockAuthBackend();
    const queryClient = new QueryClient();

    await expect(
      signIn(queryClient, { email: testUser.email, password: 'not-it' }),
    ).rejects.toMatchObject({ status: 401, detail: 'Incorrect email or password' });
    expect(session.getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(['session'])).toBeUndefined();
  });

  it('signs up and starts a session', async () => {
    mockAuthBackend();
    const queryClient = new QueryClient();

    const user = await signUp(queryClient, {
      email: 'amara.nwosu@example.com',
      password: TEST_PASSWORD,
      full_name: 'Amara Nwosu',
    });

    expect(user.email).toBe('amara.nwosu@example.com');
    expect(session.getAccessToken()).toBe('at-register');
  });
});

describe('signOut', () => {
  it('revokes server-side, clears the token and cache, and goes to /login', async () => {
    const backend = mockAuthBackend({ signedIn: true });
    const app = renderApp('/calendar');
    await findPageHeading('Calendar');

    await act(() => signOut());

    await findPageHeading('Sign in');
    expect(app.location()).toBe('/login');
    expect(backend.calls).toContain('logout');
    expect(session.getAccessToken()).toBeNull();
    // Only the fresh "anonymous" session lookup made by /login's guard remains.
    expect(
      app.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    ).toEqual([['session']]);
    expect(app.queryClient.getQueryData(['session'])).toBeNull();
  });

  it('still signs out locally when the server is unreachable', async () => {
    mockAuthBackend({ signedIn: true });
    const app = renderApp('/calendar');
    await findPageHeading('Calendar');
    server.use(
      http.post('/api/v1/auth/logout', () => HttpResponse.error()),
      // Cookie still valid server-side, but /login must not bounce us straight back:
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await act(() => signOut());

    await findPageHeading('Sign in');
    expect(app.location()).toBe('/login');
    expect(session.getAccessToken()).toBeNull();
  });

  it('after an expired session, returns to the same page once signed back in', async () => {
    const backend = mockAuthBackend({ signedIn: true });
    const app = renderApp('/applications?status=offer');
    await findPageHeading('Applications');

    // What "expired" means server-side: the refresh cookie no longer works.
    backend.signedIn = false;
    act(() => session.end('expired'));

    await waitFor(() =>
      expect(app.location()).toBe('/login?reason=expired&next=%2Fapplications%3Fstatus%3Doffer'),
    );
  });
});

describe('sign-out broadcast from another tab', () => {
  /** In-memory BroadcastChannel shared by the fake tabs. */
  function channelHub() {
    const subscribers = new Set<(message: unknown) => void>();
    return (): AuthChannel => {
      let own: ((message: unknown) => void) | null = null;
      return {
        postMessage: (m) => subscribers.forEach((h) => h !== own && h(structuredClone(m))),
        subscribe: (h) => {
          own = h;
          subscribers.add(h);
        },
      };
    };
  }

  function tab(channel: AuthChannel) {
    const tabSession = createSessionManager({
      fetch: vi.fn(),
      locks: null,
      channel,
      now: () => 0,
      sleep: async () => undefined,
      setTimer: () => 0,
      clearTimer: () => undefined,
    });
    const queryClient = new QueryClient();
    const navigate = vi.fn();
    installSignOutHandler({
      session: tabSession,
      queryClient,
      navigate,
      currentPath: () => '/calendar',
    });
    tabSession.start(authResponse());
    queryClient.setQueryData(['session'], testUser);
    queryClient.setQueryData(['applications', { page: 1 }], [{ company: 'Monzo' }]);
    return { session: tabSession, queryClient, navigate };
  }

  it('clears the other tab’s token and cached data and sends it to /login', () => {
    const hub = channelHub();
    const tabA = tab(hub());
    const tabB = tab(hub());

    tabA.session.end('logout');

    for (const t of [tabA, tabB]) {
      expect(t.session.getAccessToken()).toBeNull();
      expect(t.queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(t.navigate).toHaveBeenCalledWith('/login', { replace: true });
    }
  });
});

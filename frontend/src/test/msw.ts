import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';

import { NO_REFRESH_COOKIE_DETAIL } from '@/lib/api/session';
import type { AuthResponse, User } from '@/types/auth';

/** Realistic seed user for tests and stories. */
export const testUser: User = {
  id: '6d1f3c2e-8b7a-4e59-9c41-2a0f5e7d8b13',
  email: 'sam.okafor@example.com',
  full_name: 'Sam Okafor',
  theme: 'system',
  accent: 'vermilion',
  created_at: '2026-10-02T08:15:00Z',
};

export const TEST_PASSWORD = 'correct horse battery';

export const authResponse = (user: User = testUser, accessToken = 'at-test'): AuthResponse => ({
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 900,
  user,
});

const anonymousRefresh = () =>
  HttpResponse.json({ detail: NO_REFRESH_COOKIE_DETAIL }, { status: 401 });

/**
 * Network for every test. Default: an anonymous visitor (no refresh cookie). Unhandled
 * requests fail the test (see setup.ts), so no test silently talks to nothing.
 */
export const server = setupServer(http.post('/api/v1/auth/refresh', anonymousRefresh));

/**
 * A stateful fake of the backend's auth + profile endpoints: signing in sets the
 * "cookie", logging out clears it, PATCH /users/me requires a bearer token.
 */
export function mockAuthBackend({
  signedIn = false,
  user = testUser,
}: { signedIn?: boolean; user?: User } = {}) {
  const state = { signedIn, user: { ...user }, calls: [] as string[] };

  server.use(
    http.post('/api/v1/auth/refresh', () => {
      state.calls.push('refresh');
      return state.signedIn
        ? HttpResponse.json(authResponse(state.user, 'at-refresh'))
        : anonymousRefresh();
    }),
    http.post('/api/v1/auth/login', async ({ request }) => {
      state.calls.push('login');
      const body = (await request.json()) as { email: string; password: string };
      if (body.email !== state.user.email || body.password !== TEST_PASSWORD) {
        return HttpResponse.json({ detail: 'Incorrect email or password' }, { status: 401 });
      }
      state.signedIn = true;
      return HttpResponse.json(authResponse(state.user, 'at-login'));
    }),
    http.post('/api/v1/auth/register', async ({ request }) => {
      state.calls.push('register');
      const body = (await request.json()) as { email: string; full_name: string };
      if (body.email === state.user.email) {
        return HttpResponse.json(
          { detail: 'An account with this email already exists' },
          { status: 409 },
        );
      }
      state.user = { ...state.user, email: body.email, full_name: body.full_name };
      state.signedIn = true;
      return HttpResponse.json(authResponse(state.user, 'at-register'), { status: 201 });
    }),
    http.post('/api/v1/auth/logout', () => {
      state.calls.push('logout');
      state.signedIn = false;
      return new HttpResponse(null, { status: 204 });
    }),
    http.patch('/api/v1/users/me', async ({ request }) => {
      state.calls.push('patch-me');
      if (!request.headers.get('Authorization')?.startsWith('Bearer ')) {
        return HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 });
      }
      state.user = { ...state.user, ...((await request.json()) as Partial<User>) };
      return HttpResponse.json(state.user);
    }),
  );
  return state;
}

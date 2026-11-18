import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockAuthBackend, server, testUser } from '@/test/msw';
import { mockApplicationsBackend } from '@/test/fake-applications';
import { findPageHeading, renderApp } from '@/test/render-app';

// Signed-in pages load their data (e.g. /applications loads the board).
beforeEach(() => {
  mockApplicationsBackend({ applications: [] });
});

describe('route guards', () => {
  it('sends anonymous visitors to /login, remembering where they were going', async () => {
    mockAuthBackend({ signedIn: false });
    const app = renderApp('/calendar?view=week');

    await findPageHeading('Sign in');
    expect(app.location()).toBe('/login?next=%2Fcalendar%3Fview%3Dweek');
  });

  it('treats a 401 from refresh on first load as anonymous, not as an error', async () => {
    // Default handler: no refresh cookie → 401 "Not authenticated".
    renderApp('/dashboard');
    await findPageHeading('Sign in');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('restores a session with one refresh call and renders the protected page', async () => {
    const backend = mockAuthBackend({ signedIn: true });
    const app = renderApp('/calendar');

    await findPageHeading('Calendar');
    expect(app.location()).toBe('/calendar');
    expect(backend.calls).toEqual(['refresh']); // the user comes back with the token
    expect(app.queryClient.getQueryData(['session'])).toMatchObject({ email: testUser.email });
  });

  it('keeps anonymous visitors on /login (no redirect loop)', async () => {
    const app = renderApp('/login');
    await findPageHeading('Sign in');
    expect(app.location()).toBe('/login');
  });

  it('sends signed-in visitors from /login to a safe ?next', async () => {
    mockAuthBackend({ signedIn: true });
    const app = renderApp('/login?next=%2Fapplications%3Fstatus%3Doffer');

    await findPageHeading('Applications');
    expect(app.location()).toBe('/applications?status=offer');
  });

  it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)', '/\\evil.example'])(
    'ignores an unsafe ?next=%s and goes to the dashboard',
    async (next) => {
      mockAuthBackend({ signedIn: true });
      const app = renderApp(`/register?next=${encodeURIComponent(next)}`);

      await findPageHeading('Dashboard');
      expect(app.location()).toBe('/dashboard');
    },
  );

  it('shows an error (not the login page) when the API is unreachable on a protected page', async () => {
    server.use(http.post('/api/v1/auth/refresh', () => HttpResponse.error()));
    const app = renderApp('/dashboard');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Can’t reach JobTrack/);
    expect(app.location()).toBe('/dashboard');
  });

  it('still shows the login form when the API is unreachable', async () => {
    server.use(http.post('/api/v1/auth/refresh', () => HttpResponse.error()));
    renderApp('/login');
    await findPageHeading('Sign in');
  });

  it('applies the theme and accent saved on the account', async () => {
    mockAuthBackend({ signedIn: true, user: { ...testUser, theme: 'dark', accent: 'cobalt' } });
    renderApp('/dashboard');

    await findPageHeading('Dashboard');
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(document.documentElement.dataset['accent']).toBe('cobalt');
    // Cached for the pre-paint script on the next cold load (the only auth-adjacent
    // values in localStorage; tokens never are).
    expect(localStorage.getItem('jobtrack:theme')).toBe('dark');
    expect(localStorage.getItem('jobtrack:accent')).toBe('cobalt');
    expect(Object.keys(localStorage).sort()).toEqual(['jobtrack:accent', 'jobtrack:theme']);
  });
});

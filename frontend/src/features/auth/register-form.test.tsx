import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { session } from '@/lib/api/session';
import { emptyAnalytics, mockAnalyticsBackend } from '@/test/fake-analytics';
import { mockAuthBackend, server, TEST_PASSWORD, testUser } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

async function openRegister(path = '/register') {
  const app = renderApp(path);
  await findPageHeading('Create your account');
  return app;
}

async function fillIn(values: { name: string; email: string; password: string }) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Full name'), values.name);
  await user.type(screen.getByLabelText('Email'), values.email);
  await user.type(screen.getByLabelText('Password'), values.password);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

// These flows end on the dashboard, which loads analytics.
beforeEach(() => {
  mockAnalyticsBackend(emptyAnalytics());
});

describe('RegisterForm', () => {
  it('creates the account, signs in and opens the dashboard', async () => {
    mockAuthBackend();
    const app = await openRegister();

    expect(screen.getByLabelText('Full name')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('Email')).toHaveAttribute('spellcheck', 'false');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocapitalize', 'none');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    await fillIn({
      name: 'Amara Nwosu',
      email: 'amara.nwosu@example.com',
      password: TEST_PASSWORD,
    });

    await findPageHeading('Dashboard');
    expect(app.location()).toBe('/dashboard');
    expect(session.getAccessToken()).toBe('at-register');
  });

  it('announces the password rule up front and enforces it', async () => {
    const backend = mockAuthBackend();
    await openRegister();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAccessibleDescription(/At least 8 characters/);

    await fillIn({ name: 'Amara Nwosu', email: 'amara.nwosu@example.com', password: 'short' });

    expect(password).toHaveAccessibleDescription(/Use at least 8 characters/);
    expect(password).toHaveFocus();
    expect(backend.calls).not.toContain('register');
  });

  it('shows "already exists" (409) on the email field', async () => {
    mockAuthBackend();
    await openRegister();

    await fillIn({ name: 'Sam Okafor', email: testUser.email, password: TEST_PASSWORD });

    const email = screen.getByLabelText('Email');
    expect(await screen.findByText('An account with this email already exists')).toBeVisible();
    expect(email).toBeInvalid();
    expect(email).toHaveFocus();
  });

  it('says the server is unreachable when the dev proxy answers 502 (API not running)', async () => {
    mockAuthBackend();
    server.use(http.post('/api/v1/auth/register', () => new HttpResponse(null, { status: 502 })));
    await openRegister();

    await fillIn({
      name: 'Amara Nwosu',
      email: 'amara.nwosu@example.com',
      password: TEST_PASSWORD,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Can’t reach JobTrack. Check your connection and try again.',
    );
  });

  it('maps server field errors (422) onto the form', async () => {
    mockAuthBackend();
    server.use(
      http.post('/api/v1/auth/register', () =>
        HttpResponse.json(
          {
            detail: [
              {
                loc: ['body', 'full_name'],
                msg: 'String should have at most 120 characters',
                type: 'string_too_long',
              },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    await openRegister();

    await fillIn({
      name: 'Amara Nwosu',
      email: 'amara.nwosu@example.com',
      password: TEST_PASSWORD,
    });

    expect(await screen.findByText('String should have at most 120 characters')).toBeVisible();
    expect(screen.getByLabelText('Full name')).toHaveFocus();
  });
});

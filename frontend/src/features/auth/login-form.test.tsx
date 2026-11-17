import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { mockAuthBackend, server, TEST_PASSWORD, testUser } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

const emailField = () => screen.getByLabelText('Email');
const passwordField = () => screen.getByLabelText('Password');
const submit = () => screen.getByRole('button', { name: /sign in|try again/i });

async function openLogin(path = '/login') {
  const app = renderApp(path);
  await findPageHeading('Sign in');
  return app;
}

describe('LoginForm', () => {
  it('validates on the client, focuses the first problem and wires up the messages', async () => {
    const backend = mockAuthBackend();
    const user = userEvent.setup();
    await openLogin();

    await user.click(submit());

    expect(emailField()).toHaveFocus();
    expect(emailField()).toBeInvalid();
    expect(emailField()).toHaveAccessibleDescription('Enter your email address');
    expect(passwordField()).toHaveAccessibleDescription('Enter your password');
    expect(backend.calls).not.toContain('login');
  });

  it('signs in and continues to the remembered page', async () => {
    mockAuthBackend();
    const user = userEvent.setup();
    const app = await openLogin('/login?next=%2Fcalendar');

    expect(emailField()).toHaveAttribute('autocomplete', 'email');
    expect(passwordField()).toHaveAttribute('autocomplete', 'current-password');
    await user.type(emailField(), testUser.email);
    await user.type(passwordField(), TEST_PASSWORD);
    await user.click(submit());

    await findPageHeading('Calendar');
    expect(app.location()).toBe('/calendar');
  });

  it('gives one message for wrong credentials, then clears and focuses the password', async () => {
    mockAuthBackend();
    const user = userEvent.setup();
    await openLogin();

    await user.type(emailField(), testUser.email);
    await user.type(passwordField(), 'not my password');
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(passwordField()).toHaveValue('');
    expect(passwordField()).toHaveFocus();
    expect(emailField()).toHaveValue(testUser.email);
  });

  it('puts server validation errors (422) on their fields', async () => {
    mockAuthBackend();
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          {
            detail: [
              {
                loc: ['body', 'email'],
                msg: 'value is not a valid email address: The domain name example.invalid does not exist.',
                type: 'value_error',
              },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    await openLogin();

    await user.type(emailField(), 'sam@example.invalid');
    await user.type(passwordField(), TEST_PASSWORD);
    await user.click(submit());

    await waitFor(() =>
      expect(emailField()).toHaveAccessibleDescription(/domain name example\.invalid/),
    );
    expect(emailField()).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('on 429 explains the wait, counts down on the button, then lets the user retry', async () => {
    mockAuthBackend();
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          { detail: 'Too many attempts, please try again later' },
          { status: 429, headers: { 'Retry-After': '1' } },
        ),
      ),
    );
    const user = userEvent.setup();
    await openLogin();

    await user.type(emailField(), testUser.email);
    await user.type(passwordField(), TEST_PASSWORD);
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts, please try again later Try again in 1 second.',
    );
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveTextContent('Try again in 1s');

    await waitFor(() => expect(submit()).toBeEnabled(), { timeout: 2500 });
    expect(submit()).toHaveTextContent('Sign in');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports an unreachable server without losing what was typed', async () => {
    mockAuthBackend();
    server.use(http.post('/api/v1/auth/login', () => HttpResponse.error()));
    const user = userEvent.setup();
    await openLogin();

    await user.type(emailField(), testUser.email);
    await user.type(passwordField(), TEST_PASSWORD);
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach JobTrack");
    expect(passwordField()).toHaveValue(TEST_PASSWORD);
  });

  it('explains an expired session', async () => {
    await openLogin('/login?reason=expired&next=%2Fcalendar');
    expect(screen.getByRole('status')).toHaveTextContent('Your session expired');
  });

  it('can show and hide the password', async () => {
    const user = userEvent.setup();
    await openLogin();
    const toggle = screen.getByRole('button', { name: 'Show password' });

    expect(passwordField()).toHaveAttribute('type', 'password');
    await user.click(toggle);
    expect(passwordField()).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(passwordField()).toHaveAttribute('type', 'password');
  });

  it('keeps ?next when switching to sign-up, and drops unsafe values', async () => {
    renderApp('/login?next=%2Fapplications');
    await findPageHeading('Sign in');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register?next=%2Fapplications',
    );
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { emptyAnalytics, mockAnalyticsBackend } from '@/test/fake-analytics';
import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server, TEST_PASSWORD, testUser } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

// These flows end on the dashboard, which loads analytics and the board.
beforeEach(() => {
  mockAnalyticsBackend(emptyAnalytics());
  mockApplicationsBackend({ applications: [] });
});

const HERO = 'Every application, on the record.';

describe('landing page', () => {
  it('greets anonymous visitors with the pitch, sign-up and the sign-in form', async () => {
    renderApp('/');

    await findPageHeading(HERO);
    await waitFor(() => expect(document.title).toBe('JobTrack: every application, on the record'));
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Start tracking, free' })).toHaveAttribute(
      'href',
      '/register',
    );
    const card = within(main).getByRole('complementary', { name: 'Sign in' });
    expect(await within(card).findByLabelText('Email')).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Account' })).getByRole('link', {
        name: 'Sign in',
      }),
    ).toHaveAttribute('href', '#signin');
    expect(within(main).getByRole('list', { name: 'What JobTrack does' })).toHaveTextContent(
      'for example, 3 interviews from 12 applications',
    );
  });

  it('signs in from the landing page and opens the dashboard', async () => {
    mockAuthBackend();
    const user = userEvent.setup();
    const app = renderApp('/');
    await findPageHeading(HERO);

    const card = screen.getByRole('complementary', { name: 'Sign in' });
    await user.type(await within(card).findByLabelText('Email'), testUser.email);
    await user.type(within(card).getByLabelText('Password'), TEST_PASSWORD);
    await user.click(within(card).getByRole('button', { name: 'Sign in' }));

    await findPageHeading('Dashboard');
    expect(app.location()).toBe('/dashboard');
  });

  it('renders the hero without waiting for the session check', async () => {
    // A session check that never answers: the page must not depend on it.
    server.use(http.post('/api/v1/auth/refresh', () => new Promise<Response>(() => undefined)));
    renderApp('/');

    await findPageHeading(HERO);
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Start tracking, free' }),
    ).toBeVisible();
  });

  it('offers signed-in visitors their dashboard instead of redirecting', async () => {
    mockAuthBackend({ signedIn: true });
    const app = renderApp('/');

    await findPageHeading(HERO);
    const card = await screen.findByRole('complementary', { name: 'Welcome back' });
    expect(card).toHaveTextContent(`You’re signed in as ${testUser.full_name}.`);
    expect(within(card).getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    const main = screen.getByRole('main');
    expect(
      within(main).queryByRole('link', { name: 'Start tracking, free' }),
    ).not.toBeInTheDocument();
    expect(within(main).queryByLabelText('Password')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Account' })).getByRole('link', {
        name: 'Open your dashboard',
      }),
    ).toBeInTheDocument();
    expect(app.location()).toBe('/');
  });

  it('opens sign-up from the call to action', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await findPageHeading(HERO);

    await user.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Start tracking, free' }),
    );
    await findPageHeading('Create your account');
  });
});

describe('skip link and brand name', () => {
  it.each([
    ['/', HERO],
    ['/login', 'Sign in'],
    ['/register', 'Create your account'],
  ])('on %s the first Tab stop skips to the main content', async (path, heading) => {
    const user = userEvent.setup();
    renderApp(path);
    await findPageHeading(heading);

    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('keeps the JobTrack wordmark out of browser translation', async () => {
    renderApp('/');
    await findPageHeading(HERO);
    expect(screen.getByRole('link', { name: 'JobTrack' })).toHaveAttribute('translate', 'no');
  });
});

describe('auth layout', () => {
  it('links the nameplate home and keeps the sample week out of the accessibility tree', async () => {
    renderApp('/login');
    await findPageHeading('Sign in');

    expect(screen.getByRole('link', { name: 'JobTrack' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.getByText('A sample week in JobTrack')).toBeInTheDocument(); // still drawn
  });
});

describe('user menu', () => {
  async function openMenu() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Account: ${testUser.full_name}` }));
    return { user, menu: await screen.findByRole('menu') };
  }

  it('shows who is signed in', async () => {
    mockAuthBackend({ signedIn: true });
    renderApp('/dashboard');
    await findPageHeading('Dashboard');

    expect(screen.getByText('SO')).toBeInTheDocument(); // initials
    const { menu } = await openMenu();
    expect(within(menu).getByText(testUser.email)).toBeVisible();
  });

  it('opens settings', async () => {
    mockAuthBackend({ signedIn: true });
    renderApp('/dashboard');
    await findPageHeading('Dashboard');

    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: 'Settings' }));
    await findPageHeading('Settings');
  });

  it('signs out: revokes the session and returns to sign-in', async () => {
    const backend = mockAuthBackend({ signedIn: true });
    const app = renderApp('/calendar');
    await findPageHeading('Calendar');

    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));

    await findPageHeading('Sign in');
    expect(app.location()).toBe('/login');
    expect(backend.calls).toContain('logout');
  });
});

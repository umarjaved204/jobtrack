import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { mockAuthBackend, testUser } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

describe('landing page', () => {
  it('greets anonymous visitors with the pitch and both ways in', async () => {
    renderApp('/');

    await findPageHeading('Every application, accounted for.');
    await waitFor(() => expect(document.title).toBe('JobTrack: every application, accounted for'));
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(within(main).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    // The sample week is real content here, labelled as an example.
    expect(screen.getByRole('figure', { name: 'A sample week in JobTrack' })).toBeVisible();
  });

  it('sends signed-in visitors straight to the dashboard', async () => {
    mockAuthBackend({ signedIn: true });
    const app = renderApp('/');

    await findPageHeading('Dashboard');
    expect(app.location()).toBe('/dashboard');
  });

  it('opens sign-up from the call to action', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await findPageHeading('Every application, accounted for.');

    await user.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Create an account' }),
    );
    await findPageHeading('Create your account');
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

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockAnalyticsBackend } from '@/test/fake-analytics';
import { makeApplication, mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

/*
 * jsdom reports neither a Mac platform nor a Mac user agent, so the shortcut is Ctrl+K
 * (commands.test.ts covers ⌘K).
 */

beforeEach(() => {
  mockAuthBackend({ signedIn: true });
  mockAnalyticsBackend(); // the dashboard, where most tests start
  mockApplicationsBackend({
    applications: [
      makeApplication({
        id: 'app-monzo',
        company: 'Monzo',
        role_title: 'Senior Frontend Engineer',
        status: 'interview',
        created_at: '2026-11-02T09:00:00Z',
      }),
      makeApplication({
        id: 'app-skyscanner',
        company: 'Skyscanner',
        role_title: 'Product Engineer',
        status: 'applied',
        created_at: '2026-11-10T09:00:00Z',
      }),
    ],
  });
});

async function openApp(path = '/dashboard') {
  const user = userEvent.setup();
  const { router } = renderApp(path);
  await findPageHeading(path === '/applications' ? 'Applications' : 'Dashboard');
  return { user, router };
}

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}k{/Control}');
  const palette = await screen.findByRole('dialog', { name: 'Command palette' });
  const input = within(palette).getByRole('combobox');
  await waitFor(() => expect(input).toHaveFocus());
  return { palette, input };
}

describe('command palette', () => {
  it('opens with Ctrl+K, closes with Escape and gives focus back', async () => {
    const { user } = await openApp();
    const trigger = screen.getByRole('button', { name: 'Search or jump to…' });
    expect(trigger).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    trigger.focus();

    await openPalette(user);
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus()); // Radix returns it on the next tick
  });

  it('opens from the masthead button, newest applications first', async () => {
    const { user } = await openApp();
    await user.click(screen.getByRole('button', { name: 'Search or jump to…' }));
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });

    const recent = await within(palette).findByRole('group', { name: 'Recently added' });
    expect(
      within(recent)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Skyscanner · Product EngineerApplied',
      'Monzo · Senior Frontend EngineerInterview',
    ]);
    // The first row is highlighted, ready for Enter.
    expect(within(palette).getByRole('option', { name: 'Add an application' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('goes to a section, and focus moves to its heading', async () => {
    const { user, router } = await openApp();
    const { input } = await openPalette(user);

    await user.type(input, 'calendar');
    await user.keyboard('{Enter}');

    const heading = await findPageHeading('Calendar');
    expect(router.state.location.pathname).toBe('/calendar');
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('searches applications on the server and opens the one chosen', async () => {
    const { user, router } = await openApp();
    const { palette, input } = await openPalette(user);

    await user.type(input, 'monzo');
    const results = await within(palette).findByRole('group', { name: 'Applications' });
    expect(within(results).getAllByRole('option')).toHaveLength(1);
    // No command mentions Monzo, so the result is the highlighted row.
    await user.keyboard('{Enter}');

    await waitFor(() => expect(router.state.location.pathname).toBe('/applications/app-monzo'));
  });

  it('says when nothing matches, and when the search fails', async () => {
    const { user } = await openApp();
    const { palette, input } = await openPalette(user);

    await user.type(input, 'zebra crossing');
    const status = within(palette).getByRole('status');
    expect(status).toHaveTextContent('Searching your applications…');
    await waitFor(() => expect(status).toHaveTextContent('Nothing matches “zebra crossing”.'));

    server.use(
      http.get('/api/v1/applications', () =>
        HttpResponse.json({ detail: 'Boom' }, { status: 500 }),
      ),
    );
    await user.clear(input);
    await user.type(input, 'sky');
    await waitFor(() =>
      expect(within(palette).getByRole('status')).toHaveTextContent(
        'Couldn’t search your applications.',
      ),
    );
  });

  it('opens the add form on Applications; closing it clears the request', async () => {
    const { user, router } = await openApp();
    const { input } = await openPalette(user);

    await user.type(input, 'add');
    await user.keyboard('{Enter}');

    const form = await screen.findByRole('dialog', { name: 'Add an application' });
    expect(router.state.location.pathname).toBe('/applications');
    await waitFor(() => expect(form).toContainElement(document.activeElement as HTMLElement));

    await user.keyboard('{Escape}'); // nothing typed, so it closes without asking
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add an application' })).not.toBeInTheDocument(),
    );
    expect(router.state.location.state).toBeNull();
  });

  it('switches the theme, and stops offering the one in use', async () => {
    const { user } = await openApp();
    let { input } = await openPalette(user);

    await user.type(input, 'dark');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));

    ({ input } = await openPalette(user));
    await user.type(input, 'theme');
    const palette = screen.getByRole('dialog', { name: 'Command palette' });
    expect(
      within(palette)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Switch to the light theme', 'Match the system theme']);
  });
});

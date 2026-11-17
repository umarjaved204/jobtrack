import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '@/app/app';
import { routes } from '@/app/routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

/**
 * Waits for a page's h1 and for it to become visible. Pages fade in (motion), and
 * motion applies the end state on its next animation frame, so visibility is async.
 */
async function findPageHeading(name: string) {
  const heading = await screen.findByRole('heading', { level: 1, name });
  await waitFor(() => expect(heading).toBeVisible());
  return heading;
}

/** The desktop section bar (the drawer's nav only exists while it is open). */
const sectionNav = () => screen.getByRole('navigation', { name: 'Sections' });

describe('App shell', () => {
  it('redirects / to the dashboard', async () => {
    const router = renderAt('/');
    await findPageHeading('Dashboard');
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('marks the current section and sets the document title', async () => {
    renderAt('/calendar');
    await findPageHeading('Calendar');

    const nav = sectionNav();
    expect(within(nav).getByRole('link', { name: /Calendar/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: /Dashboard/ })).not.toHaveAttribute(
      'aria-current',
    );
    await waitFor(() => expect(document.title).toBe('Calendar · JobTrack'));
  });

  it('navigates between sections and moves focus to the new heading', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard');
    await findPageHeading('Dashboard');

    await user.click(within(sectionNav()).getByRole('link', { name: /Applications/ }));

    const heading = await findPageHeading('Applications');
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('offers a skip link to the main content', async () => {
    renderAt('/dashboard');
    await findPageHeading('Dashboard');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('opens the mobile drawer and closes it after choosing a section', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard');
    await findPageHeading('Dashboard');

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('link', { name: /Resumes/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await findPageHeading('Resume versions');
  });

  it('switches theme from the appearance menu', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard');
    await findPageHeading('Dashboard');

    await user.click(screen.getByRole('button', { name: 'Appearance' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Night edition/ }));
    expect(document.documentElement).toHaveClass('dark');

    await user.click(screen.getByRole('button', { name: 'Appearance' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /cobalt/i }));
    expect(document.documentElement.dataset['accent']).toBe('cobalt');
  });

  it('shows a 404 page inside the shell for unknown URLs', async () => {
    renderAt('/no-such-page');
    await findPageHeading('Stop the presses');
    expect(sectionNav()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to dashboard/ })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });
});

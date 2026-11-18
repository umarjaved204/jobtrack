import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { todayDateOnly } from '@/lib/dates';
import { emptyAnalytics, mockAnalyticsBackend } from '@/test/fake-analytics';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

import { analyticsKeys } from './api';
import { periodFor } from './range';

beforeEach(() => {
  mockAuthBackend({ signedIn: true });
});

async function openDashboard(path = '/dashboard') {
  const app = renderApp(path);
  await findPageHeading('Dashboard');
  await screen.findByRole('region', { name: /Key figures/ });
  return app;
}
/** A figure's value as a screen reader hears it (the hidden text, not the rolling digits). */
const figure = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).parentElement?.querySelector('dd') ?? null;
/** NumberFlow stand-ins (see test/number-flow-stub.tsx) inside a figure. */
const flows = (label: string) => [...(figure(label)?.querySelectorAll('[data-number-flow]') ?? [])];

describe('stat strip', () => {
  it('shows the headline figures with their denominators', async () => {
    mockAnalyticsBackend();
    await openDashboard();

    await waitFor(() => expect(figure('Applied')).toHaveTextContent('32'));
    expect(figure('Active')).toHaveTextContent('14');
    expect(figure('Interview rate')).toHaveTextContent('28%');
    expect(screen.getByText('9 of 32 reached an interview')).toBeVisible();
    expect(figure('Offers')).toHaveTextContent('2');
    expect(
      screen.getByText(
        (_, el) => el?.tagName === 'P' && /^Plus 6 roles on your wishlist/.test(el.textContent),
      ),
    ).toBeVisible();
  });

  it('shows a dash, not 0%, when nothing was applied for', async () => {
    mockAnalyticsBackend(emptyAnalytics());
    await openDashboard();

    expect(figure('Interview rate')).toHaveTextContent('—');
    expect(
      within(figure('Interview rate') as HTMLElement).getByText('Not enough data'),
    ).toHaveClass('sr-only');
    expect(screen.getAllByText('Nothing applied for in this period')).toHaveLength(2);
    expect(screen.getByText('Nothing on your wishlist.')).toBeVisible();
  });

  it('counts up on first load', async () => {
    mockAnalyticsBackend();
    await openDashboard();

    await waitFor(() => expect(flows('Applied')[0]).toHaveTextContent('32'));
    expect(flows('Applied')[0]).toHaveAttribute('data-animated', 'true');
  });

  it('animates a range change, but not a background refresh', async () => {
    const backend = mockAnalyticsBackend();
    const user = userEvent.setup();
    const app = await openDashboard();
    await waitFor(() => expect(flows('Applied')[0]).toHaveTextContent('32'));

    // New range: new figures roll in.
    backend.data.summary = { ...backend.data.summary, applied: 12 };
    await user.click(screen.getByRole('button', { name: 'Last 30 days' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(app.location()).toBe('/dashboard?range=30d');
    const { from, to } = periodFor('30d', todayDateOnly());
    await waitFor(() => expect(backend.requests).toContain(`summary?from=${from}&to=${to}`));
    await waitFor(() => expect(flows('Applied')[0]).toHaveTextContent('12'));
    expect(flows('Applied')[0]).toHaveAttribute('data-animated', 'true');

    // Same range, refreshed in the background (e.g. after moving a card): no motion.
    backend.data.summary = { ...backend.data.summary, applied: 13 };
    await app.queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
    await waitFor(() => expect(flows('Applied')[0]).toHaveTextContent('13'));
    expect(flows('Applied')[0]).toHaveAttribute('data-animated', 'false');
  });

  it('reads the range from the URL, ignoring unknown values', async () => {
    const backend = mockAnalyticsBackend();
    await openDashboard('/dashboard?range=forever');

    expect(screen.getByRole('button', { name: 'Last 90 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const { from, to } = periodFor('90d', todayDateOnly());
    expect(backend.requests).toContain(`summary?from=${from}&to=${to}`);
  });

  it('offers a retry when the figures fail to load', async () => {
    mockAnalyticsBackend();
    server.use(
      http.get('/api/v1/analytics/summary', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );
    renderApp('/dashboard');

    expect(await screen.findByText('Your figures didn’t load')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

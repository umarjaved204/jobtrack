import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { todayDateOnly } from '@/lib/dates';
import { emptyAnalytics, mockAnalyticsBackend } from '@/test/fake-analytics';
import { toInstant } from '@/features/reminders/due';
import {
  makeApplication,
  makeEvent,
  makeReminder,
  mockApplicationsBackend,
} from '@/test/fake-applications';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

import { analyticsKeys } from './api';
import { periodFor } from './range';

beforeEach(() => {
  mockAuthBackend({ signedIn: true });
  mockApplicationsBackend(); // a few applications: not a brand-new account
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
    await findPageHeading('Dashboard'); // the page fades in

    expect(await screen.findByText('Your figures didn’t load')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

describe('applications over time', () => {
  // The chart marks the bucket holding "today" as "so far", so pin the date (Date only:
  // real timers keep MSW and the router running normally).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 18, 12)); // Wed 18 Nov 2026, local time
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('summarises the chart in its caption and gives the data as a table', async () => {
    mockAnalyticsBackend();
    await openDashboard();

    const chart = await screen.findByRole('figure', { name: 'Applications over time' });
    expect(
      within(chart).getByText(
        '32 applications over 13 weeks, about 2.5 a week. Busiest: week of 5 Oct 2026 (5). ' +
          'This week so far: 2.',
      ),
    ).toBeVisible();
    const table = within(chart).getByRole('table', { name: 'Applications per week' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(14); // header + 13 weeks, zero weeks included
    expect(rows[5]).toHaveTextContent('Week of 21 Sep 2026' + '0');
    expect(rows[13]).toHaveTextContent('Week of 16 Nov 2026' + '2 so far');
  });

  it('says what will appear when the period has no applications', async () => {
    mockAnalyticsBackend(emptyAnalytics());
    await openDashboard();

    const chart = await screen.findByRole('figure', { name: 'Applications over time' });
    expect(within(chart).getByText('No applications in this period.')).toBeVisible();
    expect(within(chart).getByText(/will show here, week by week/)).toBeVisible();
  });

  it('fails on its own: the figures still show', async () => {
    mockAnalyticsBackend();
    server.use(
      http.get('/api/v1/analytics/timeseries', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );
    await openDashboard();

    expect(await screen.findByText('Applications over time didn’t load')).toBeVisible();
    expect(figure('Applied')).toHaveTextContent('32');
  });
});

describe('pipeline and sources', () => {
  it('show alongside the other sections', async () => {
    mockAnalyticsBackend();
    await openDashboard();

    expect(await screen.findByRole('figure', { name: 'Pipeline' })).toBeVisible();
    expect(screen.getByRole('figure', { name: 'Sources' })).toBeVisible();
  });

  it('fail independently', async () => {
    mockAnalyticsBackend();
    server.use(
      http.get('/api/v1/analytics/funnel', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );
    await openDashboard();

    expect(await screen.findByText('The pipeline didn’t load')).toBeVisible();
    expect(await screen.findByRole('figure', { name: 'Sources' })).toBeVisible();
    expect(screen.getByRole('figure', { name: 'Applications over time' })).toBeVisible();
  });
});

describe('coming up', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 18, 23, 30)); // late on Wed 18 Nov, local time
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const wishlist = (company: string, deadline_on: string) =>
    makeApplication({ company, deadline_on, status: 'wishlist', applied_on: null });
  const links = (region: HTMLElement) =>
    within(region)
      .getAllByRole('link')
      .map((l) => l.textContent);

  it('lists missed apply-by dates first, then those due soon, by the browser’s date', async () => {
    mockAnalyticsBackend();
    mockApplicationsBackend({
      applications: [
        wishlist('Monzo', '2026-11-18'), // today, late evening: still due, not missed
        wishlist('Wise', '2026-11-17'),
        wishlist('Figma', '2026-11-25'),
        wishlist('Old', '2026-09-01'), // missed long ago: counted, not listed
        makeApplication({ company: 'Starling', deadline_on: '2026-11-19', status: 'applied' }),
        wishlist('Octopus', '2026-12-02'), // 14 days: too far
      ],
    });
    await openDashboard();

    const panel = await screen.findByRole('region', { name: 'Coming up' });
    const missed = await within(panel).findByRole('region', { name: 'Overdue (2)' });
    expect(links(missed)).toEqual(['Apply to Wise']);
    expect(within(missed).getByText('Yesterday')).toBeVisible();
    expect(within(missed).getByText('+1 older (more than 30 days ago).')).toBeVisible();
    const soon = within(panel).getByRole('region', { name: 'Next 14 days (2)' });
    expect(links(soon)).toEqual(['Apply to Monzo', 'Apply to Figma']);
    expect(within(soon).getByText('Today')).toBeVisible();
    expect(within(soon).getByText('In 7 days')).toBeVisible();
    expect(within(panel).queryByText(/Starling/)).not.toBeInTheDocument(); // already applied
  });

  it('joins follow-ups and interviews, and ticks a follow-up off from here', async () => {
    mockAnalyticsBackend();
    const deliveroo = makeApplication({ company: 'Deliveroo', status: 'interview' });
    const backend = mockApplicationsBackend({
      applications: [deliveroo, wishlist('Figma', '2026-11-20')],
      reminders: [
        makeReminder({ title: 'Chase the recruiter', application_id: deliveroo.id, due_on: '2026-11-16' }),
        makeReminder({ title: 'Prep questions', due_at: toInstant('2026-11-19', '09:00') }),
        makeReminder({ title: 'Done already', due_on: '2026-11-17', done_at: '2026-11-17T09:00:00Z' }),
      ],
      calendarEvents: [
        makeEvent({ title: 'Pairing interview', application_id: deliveroo.id, starts_at: toInstant('2026-11-19', '14:00'), ends_at: toInstant('2026-11-19', '15:30') }),
        makeEvent({ kind: 'other', title: 'Coffee chat', starts_at: toInstant('2026-11-19', '08:00') }),
      ],
    }); // prettier-ignore
    await openDashboard();

    const panel = await screen.findByRole('region', { name: 'Coming up' });
    const overdue = await within(panel).findByRole('region', { name: 'Overdue (1)' });
    expect(within(overdue).getByText('Chase the recruiter')).toBeVisible();
    const soon = within(panel).getByRole('region', { name: 'Next 14 days (3)' });
    const rows = within(soon)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rows).toEqual([
      'Thu 19 NovFollow-up·TomorrowPrep questionsAt 09:00',
      'Thu 19 NovInterview·TomorrowPairing interview14:00–15:30, Deliveroo',
      'Fri 20 NovApply by·In 2 daysApply to FigmaSenior Frontend Engineer',
    ]);
    expect(within(panel).queryByText('Coffee chat')).not.toBeInTheDocument(); // "other"
    expect(within(panel).queryByText('Done already')).not.toBeInTheDocument();

    await userEvent.setup().click(within(overdue).getByRole('checkbox', { name: 'Chase the recruiter' }));
    await waitFor(() =>
      expect(within(panel).queryByRole('region', { name: /Overdue/ })).not.toBeInTheDocument(),
    );
    expect(backend.reminders.find((r) => r.title === 'Chase the recruiter')?.done_at).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument(); // toast survives
  }); // prettier-ignore

  it('says when nothing is coming up', async () => {
    mockAnalyticsBackend();
    mockApplicationsBackend({
      applications: [makeApplication({ deadline_on: '2026-11-20', status: 'applied' })],
    });
    await openDashboard();

    const panel = await screen.findByRole('region', { name: 'Coming up' });
    expect(await within(panel).findByText(/Nothing in the next 14 days/)).toBeVisible();
    expect(within(panel).getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      '/calendar',
    );
    expect(within(panel).queryByRole('region', { name: /Overdue/ })).not.toBeInTheDocument();
  });
});

describe('a brand-new account', () => {
  it('invites a first application instead of showing empty charts', async () => {
    mockAnalyticsBackend(emptyAnalytics());
    mockApplicationsBackend({ applications: [] });
    renderApp('/dashboard');
    await findPageHeading('Dashboard');

    expect(await screen.findByText('Your figures start with your first application')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add an application' })).toHaveAttribute(
      'href',
      '/applications',
    );
    expect(screen.queryByRole('region', { name: /Key figures/ })).not.toBeInTheDocument();
  });
});

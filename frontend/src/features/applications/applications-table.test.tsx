import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeApplication, mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';
import type { Application } from '@/types/application';

/*
 * The table view keeps its state in the URL: these tests assert on both the screen and
 * the location, and use the router's history for Back/Forward.
 */

let backend: ReturnType<typeof mockApplicationsBackend>;
beforeEach(() => {
  mockAuthBackend({ signedIn: true });
});

/** 25 applications: Company 01..25, alternating applied/interview, applied 1..25 Oct. */
function many(): Application[] {
  return Array.from({ length: 25 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return makeApplication({
      company: `Company ${n}`,
      role_title: 'Frontend Engineer',
      status: i % 2 ? 'interview' : 'applied',
      applied_on: `2026-10-${n}`,
      source: i % 3 ? 'LinkedIn' : 'Referral',
      created_at: `2026-10-${n}T09:00:00Z`,
    });
  });
}

async function openTable(path = '/applications?view=table') {
  const app = renderApp(path);
  await findPageHeading('Applications');
  await screen.findByRole('table');
  return app;
}
const companies = () =>
  within(screen.getByRole('table'))
    .getAllByRole('link')
    .map((link) => link.textContent);
const listCalls = () => backend.calls.filter((c) => c === 'GET /applications').length;
const query = (location: string) => new URL(location, 'http://x').searchParams;

describe('applications table', () => {
  it('switches between board and table, each with its own URL', async () => {
    backend = mockApplicationsBackend();
    const user = userEvent.setup();
    const app = renderApp('/applications');
    await screen.findByRole('region', { name: 'Pipeline board' });

    await user.click(screen.getByRole('link', { name: 'Table' }));
    await screen.findByRole('table');
    expect(app.location()).toBe('/applications?view=table');
    expect(screen.getByRole('link', { name: 'Table' })).toHaveAttribute('aria-current', 'page');
    const monzo = backend.applications.find((a) => a.company === 'Monzo');
    expect(screen.getByRole('link', { name: 'Monzo' })).toHaveAttribute(
      'href',
      `/applications/${monzo?.id}`,
    );

    await user.click(screen.getByRole('link', { name: 'Board' }));
    await screen.findByRole('region', { name: 'Pipeline board' });
    expect(app.location()).toBe('/applications');
  });

  it('ignores invalid URL params, keeping the valid ones', async () => {
    backend = mockApplicationsBackend();
    await openTable('/applications?view=table&status=hired&status=applied&sort=salary&page=abc');

    await waitFor(() => expect(companies()).toEqual(expect.arrayContaining(['Monzo', 'Wise'])));
    expect(companies()).toHaveLength(2);
    expect(screen.getByLabelText('Sort')).toHaveTextContent('Recently added');
  });

  it('searches after a pause in typing, with one request, and Back clears it', async () => {
    backend = mockApplicationsBackend();
    const user = userEvent.setup();
    const app = await openTable();
    const before = listCalls();

    await user.type(screen.getByRole('searchbox', { name: 'Search company or role' }), 'wis');

    await waitFor(() => expect(companies()).toEqual(['Wise']));
    expect(query(app.location()).get('q')).toBe('wis');
    expect(listCalls()).toBe(before + 1); // not one per keystroke

    await app.router.navigate(-1);
    await waitFor(() => expect(companies()).toHaveLength(6));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('pages through results with links, and a filter change goes back to page 1', async () => {
    backend = mockApplicationsBackend({ applications: many() });
    const user = userEvent.setup();
    const app = await openTable('/applications?view=table&page_size=10');

    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 to 10 of 25 applications');
    await user.click(screen.getByRole('link', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Showing 11 to 20 of 25'),
    );
    expect(query(app.location()).get('page')).toBe('2');
    expect(screen.getByRole('link', { name: 'Previous' })).not.toHaveAttribute('aria-disabled');

    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: /Interview/ }));
    await waitFor(() => expect(query(app.location()).getAll('status')).toEqual(['interview']));
    expect(query(app.location()).get('page')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Showing 1 to 10 of 12'),
    );
  });

  it('sorts from a column header and says so with aria-sort', async () => {
    backend = mockApplicationsBackend();
    const user = userEvent.setup();
    const app = await openTable();
    const header = () => screen.getByRole('columnheader', { name: /Company and role/ });
    expect(header()).toHaveAttribute('aria-sort', 'none');

    await user.click(within(header()).getByRole('button'));
    await waitFor(() => expect(companies()[0]).toBe('Deliveroo'));
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    expect(query(app.location()).get('sort')).toBe('company');

    await user.click(within(header()).getByRole('button'));
    await waitFor(() => expect(companies()[0]).toBe('Wise'));
    expect(header()).toHaveAttribute('aria-sort', 'descending');
  });

  it('filters by the applied date range', async () => {
    backend = mockApplicationsBackend({ applications: many() });
    await openTable('/applications?view=table&from=2026-10-03&to=2026-10-05&sort=applied_on');

    await waitFor(() => expect(companies()).toEqual(['Company 03', 'Company 04', 'Company 05']));
    expect(screen.getByRole('button', { name: /Applied: 3 Oct to 5 Oct 2026/ })).toBeVisible();
  });

  it('explains when nothing matches, and clearing the filters brings everything back', async () => {
    backend = mockApplicationsBackend();
    const user = userEvent.setup();
    const app = renderApp('/applications?view=table&q=nothing-like-this&status=offer');

    expect(await screen.findByText('No applications match')).toBeVisible();
    expect(query(app.location()).get('page')).toBeNull(); // 0 pages isn't "past the end"
    // The empty state's button (the toolbar has one too).
    const clear = screen.getAllByRole('button', { name: 'Clear filters' }).at(-1);
    await user.click(clear as HTMLElement);

    await waitFor(() => expect(companies()).toHaveLength(6));
    expect(app.location()).toBe('/applications?view=table');
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('goes to the last page when the URL asks for one past the end', async () => {
    backend = mockApplicationsBackend({ applications: many() });
    const app = await openTable('/applications?view=table&page_size=10&page=9');

    await waitFor(() => expect(query(app.location()).get('page')).toBe('3'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Showing 21 to 25 of 25'),
    );
  });

  it('invites you to add the first application when there are none', async () => {
    backend = mockApplicationsBackend({ applications: [] });
    renderApp('/applications?view=table');
    expect(await screen.findByText('No applications yet')).toBeVisible();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });
});

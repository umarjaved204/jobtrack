import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toInstant } from '@/features/reminders/due';
import { makeEvent, makeReminder, mockApplicationsBackend } from '@/test/fake-applications';
import { selectNames, unnamedFormFields } from '@/test/form-fields';
import { mockAuthBackend } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

import { feedRange } from './month';

/*
 * Today is pinned to Thursday 19 November 2026, 12:00 local (only Date is faked). Times
 * are built from local wall times, so the page reads the same in any zone.
 */
let backend: ReturnType<typeof mockApplicationsBackend>;

function wideScreen() {
  const real = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    ...real(query),
    matches: query === '(min-width: 48rem)',
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 19, 12, 0));
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend(); // Figma (wishlist) has apply-by 2026-11-28
  const monzo = backend.applications.find((a) => a.company === 'Monzo')?.id ?? null;
  backend.calendarEvents.push(
    makeEvent({ title: 'Technical interview', application_id: monzo, starts_at: toInstant('2026-11-20', '14:00'), ends_at: toInstant('2026-11-20', '15:30'), location_or_link: 'https://meet.example.org/abc-defg' }),
    makeEvent({ kind: 'other', title: 'Coffee chat', starts_at: toInstant('2026-11-20', '08:30'), location_or_link: 'Old Street, London' }),
    makeEvent({ kind: 'assessment', title: 'Take-home window', starts_at: toInstant('2026-11-23', '09:00'), ends_at: toInstant('2026-11-25', '17:00') }),
  ); // prettier-ignore
  backend.reminders.push(
    makeReminder({ title: 'Send references', application_id: monzo, due_on: '2026-11-20' }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function open(path = '/calendar') {
  const user = userEvent.setup();
  const app = renderApp(path);
  await findPageHeading('Calendar');
  return { user, app };
}
const cell = (name: RegExp) => screen.findByRole('gridcell', { name });
const dayPanel = () => screen.getByRole('region', { name: /^\w+day \d+ \w+ 2026$/ });

describe('calendar: month grid', () => {
  beforeEach(wideScreen);

  it('shows the month Monday-first, today marked, and asks for local-midnight bounds', async () => {
    await open();

    const grid = await screen.findByRole('grid', { name: 'November 2026' });
    const headers = within(grid)
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(headers).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    const today = await cell(/^Thursday 19 November/);
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today).toHaveAttribute('tabindex', '0'); // the only day in the tab order
    expect(
      within(grid)
        .getAllByRole('gridcell')
        .filter((c) => c.tabIndex === 0),
    ).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole('gridcell', { name: /^Friday 20 November/ })).toHaveAccessibleName(
        'Friday 20 November, 3 items',
      ),
    );
    // The multi-day assessment shows on each of its days.
    expect(await cell(/^Tuesday 24 November, 1 item/)).toBeInTheDocument();
    const { from, to } = feedRange('2026-10-26', '2026-12-06');
    expect(backend.calls).toContain(`GET /calendar?from=${from}&to=${to}`);
  });

  it('moves focus with the APG keys, across months, and Enter opens the day', async () => {
    const { user, app } = await open();
    (await cell(/^Thursday 19 November/)).focus();

    await user.keyboard('{ArrowRight}');
    expect(await cell(/^Friday 20 November/)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(await cell(/^Friday 27 November/)).toHaveFocus();
    await user.keyboard('{End}');
    expect(await cell(/^Sunday 29 November/)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(await cell(/^Monday 23 November/)).toHaveFocus();
    await user.keyboard('{PageDown}');

    expect(await screen.findByRole('grid', { name: 'December 2026' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('gridcell', { name: /^Wednesday 23 December/ })).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Wednesday 23 December 2026' })).toHaveFocus(),
    );
    expect(app.location()).toBe('/calendar?month=2026-12&day=2026-12-23');
  }); // prettier-ignore

  it('lists a day’s items with safe links, and acts on them', async () => {
    const { user } = await open('/calendar?month=2026-11&day=2026-11-20');
    const panel = dayPanel();
    const list = await within(panel).findByRole('list', { name: 'On this day' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    const texts = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(texts[0]).toMatch(/^Send references/); // all-day first
    expect(texts[1]).toMatch(/^Coffee chatOther08:30Old Street, London$/);
    expect(texts[2]).toMatch(/^Technical interviewInterview14:00–15:30/);

    const link = within(list).getByRole('link', { name: /meet\.example\.org/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(list).queryByRole('link', { name: /Old Street/ })).not.toBeInTheDocument();

    await user.click(within(list).getByRole('checkbox', { name: 'Send references' }));
    await waitFor(() =>
      expect(backend.reminders.find((r) => r.title === 'Send references')?.done_at).not.toBeNull(),
    );
  });

  it('adds an event on the open day, in local time', async () => {
    const { user } = await open('/calendar?month=2026-11&day=2026-11-26');
    await user.click(await within(dayPanel()).findByRole('button', { name: 'Add event' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add an event' });
    await waitFor(() => expect(selectNames(dialog)).toEqual(['kind', 'application_id']));
    expect(unnamedFormFields(dialog)).toEqual([]);
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('2026-11-26');
    await user.type(within(dialog).getByLabelText('Title'), 'Onsite: system design');
    const start = within(dialog).getByLabelText('Start time');
    await user.clear(start);
    await user.type(start, '13:00');
    const end = within(dialog).getByLabelText('End time');
    await user.clear(end);
    await user.type(end, '15:00');
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));

    await waitFor(() =>
      expect(backend.calendarEvents.find((e) => e.title === 'Onsite: system design')).toMatchObject(
        {
          kind: 'interview',
          starts_at: toInstant('2026-11-26', '13:00'),
          ends_at: toInstant('2026-11-26', '15:00'),
        },
      ),
    );
    expect(await within(dayPanel()).findByText('Onsite: system design')).toBeVisible();
  });

  it('refuses an end before the start', async () => {
    const { user } = await open('/calendar?month=2026-11&day=2026-11-26');
    await user.click(await within(dayPanel()).findByRole('button', { name: 'Add event' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add an event' });
    await user.type(within(dialog).getByLabelText('Title'), 'Backwards');
    const end = within(dialog).getByLabelText('End time');
    await user.clear(end);
    await user.type(end, '08:00');
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));

    expect(await within(dialog).findByText('The end can’t be before the start')).toBeVisible();
    expect(backend.calls).not.toContain('POST /calendar-events');
  });

  it('deletes an event only after confirming', async () => {
    const { user } = await open('/calendar?month=2026-11&day=2026-11-20');
    await user.click(await within(dayPanel()).findByRole('button', { name: 'Delete Coffee chat' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Coffee chat?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete event' }));

    await waitFor(() =>
      expect(backend.calendarEvents.some((e) => e.title === 'Coffee chat')).toBe(false),
    );
  });

  it('steps between months with the buttons', async () => {
    const { user, app } = await open();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(await screen.findByRole('grid', { name: 'December 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    expect(app.location()).toBe('/calendar?month=2026-11&day=2026-11-19');
  });
});

describe('calendar: agenda on narrow screens', () => {
  it('lists only the days that have something, without a grid', async () => {
    await open();

    expect(await screen.findByRole('heading', { name: 'Friday 20 November 2026' })).toBeVisible();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Friday 20 November 2026',
      'Monday 23 November 2026',
      'Tuesday 24 November 2026',
      'Wednesday 25 November 2026',
      'Saturday 28 November 2026', // Figma's apply-by date
    ]);
  });
});

describe('deleting an application', () => {
  it('says how many follow-ups and calendar events go with it', async () => {
    const monzo = backend.applications.find((a) => a.company === 'Monzo')?.id ?? '';
    const user = userEvent.setup();
    renderApp(`/applications/${monzo}`);
    await findPageHeading('Monzo');

    await user.click(screen.getByRole('button', { name: 'Delete this application…' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Monzo?' });
    await waitFor(() =>
      expect(confirm).toHaveTextContent(
        'Its timeline, notes and contacts are deleted too, along with 1 follow-up and 1 calendar event. This can’t be undone.',
      ),
    );
  });
});

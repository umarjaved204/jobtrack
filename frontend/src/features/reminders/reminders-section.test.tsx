import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeReminder, mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

import { toInstant } from './due';

/*
 * The detail page's "Follow-ups". Today is pinned to Friday 20 November 2026, 12:00 local
 * (only Date is faked); timed reminders are built from local wall times, so labels read
 * the same in any time zone.
 */
let backend: ReturnType<typeof mockApplicationsBackend>;
let monzoId: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 20, 12, 0));
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend();
  monzoId = backend.applications.find((a) => a.company === 'Monzo')?.id ?? '';
});

afterEach(() => {
  vi.useRealTimers();
});

function seed() {
  backend.reminders.push(
    makeReminder({ title: 'Send portfolio link', application_id: monzoId, due_on: '2026-11-27' }),
    makeReminder({ title: 'Chase take-home feedback', application_id: monzoId, due_on: '2026-11-17' }),
    makeReminder({ title: 'Call the recruiter', application_id: monzoId, due_at: toInstant('2026-11-21', '14:00') }),
    makeReminder({ title: 'Thank-you note', application_id: monzoId, due_on: '2026-11-12', done_at: '2026-11-12T17:00:00Z' }),
    makeReminder({ title: 'Someone else’s', due_on: '2026-11-21' }),
  ); // prettier-ignore
}

async function openMonzo() {
  const user = userEvent.setup();
  renderApp(`/applications/${monzoId}`);
  await findPageHeading('Monzo');
  const section = screen.getByRole('region', { name: 'Follow-ups' });
  return { user, section };
}

const openItems = (section: HTMLElement) =>
  within(within(section).getByRole('list', { name: 'Open follow-ups' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('follow-ups on the detail page', () => {
  it('lists this application’s open follow-ups in due order, saying which are overdue', async () => {
    seed();
    const { section } = await openMonzo();

    await waitFor(() =>
      expect(openItems(section)).toEqual([
        'Chase take-home feedbackOverdue: Tue 17 Nov',
        'Call the recruiterTomorrow at 14:00',
        'Send portfolio linkFri 27 Nov',
      ]),
    );
    expect(within(section).queryByText('Thank-you note')).not.toBeInTheDocument();
    expect(within(section).queryByText('Someone else’s')).not.toBeInTheDocument();
  });

  it('adds an all-day follow-up, a week out by default', async () => {
    const { user, section } = await openMonzo();
    expect(await within(section).findByText(/Nothing to follow up/)).toBeVisible();

    await user.click(within(section).getByRole('button', { name: 'Add follow-up' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a follow-up for Monzo' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-27');
    await user.type(within(dialog).getByLabelText('What to do'), 'Ask about the salary band');
    await user.click(within(dialog).getByRole('button', { name: 'Add follow-up' }));

    await waitFor(() =>
      expect(openItems(section)).toEqual(['Ask about the salary bandFri 27 Nov']),
    );
    expect(backend.reminders[0]).toMatchObject({
      application_id: monzoId,
      due_on: '2026-11-27', // a plain date: no time zone involved
      due_at: null,
    });
  });

  it('adds a timed follow-up as a UTC instant of the local time', async () => {
    const { user, section } = await openMonzo();
    await user.click(await within(section).findByRole('button', { name: 'Add follow-up' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('What to do'), 'Prep call');
    const date = within(dialog).getByLabelText('Date');
    await user.clear(date);
    await user.type(date, '2026-11-20');
    await user.type(within(dialog).getByLabelText('Time'), '16:30');
    await user.click(within(dialog).getByRole('button', { name: 'Add follow-up' }));

    await waitFor(() => expect(openItems(section)).toEqual(['Prep callToday at 16:30']));
    expect(backend.reminders[0]).toMatchObject({
      due_on: null,
      due_at: toInstant('2026-11-20', '16:30'),
    });
  });

  it('marks one done, and undoes it from the toast', async () => {
    seed();
    const { user, section } = await openMonzo();

    await user.click(await within(section).findByRole('checkbox', { name: 'Call the recruiter' }));

    await waitFor(() => expect(openItems(section)).toHaveLength(2));
    expect(backend.reminders.find((r) => r.title === 'Call the recruiter')?.done_at).not.toBeNull();
    await user.click(within(section).getByRole('button', { name: 'Show done (2)' }));
    const done = within(section).getByRole('list', { name: 'Done follow-ups' });
    expect(within(done).getByRole('checkbox', { name: 'Call the recruiter' })).toBeChecked();

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(openItems(section)).toHaveLength(3));
    expect(backend.reminders.find((r) => r.title === 'Call the recruiter')?.done_at).toBeNull();
  });

  it('edits a follow-up from all day to a time', async () => {
    seed();
    const { user, section } = await openMonzo();

    await user.click(
      await within(section).findByRole('button', { name: 'Edit “Send portfolio link”' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit follow-up' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-27');
    await user.type(within(dialog).getByLabelText('Time'), '09:00');
    await user.click(within(dialog).getByRole('button', { name: 'Save follow-up' }));

    await waitFor(() =>
      expect(openItems(section)).toContain('Send portfolio linkFri 27 Nov at 09:00'),
    );
    expect(backend.reminders.find((r) => r.title === 'Send portfolio link')).toMatchObject({
      due_on: null,
      due_at: toInstant('2026-11-27', '09:00'),
    });
  });

  it('deletes a follow-up only after confirming', async () => {
    seed();
    const { user, section } = await openMonzo();

    await user.click(
      await within(section).findByRole('button', { name: 'Delete “Send portfolio link”' }),
    );
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete this follow-up?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete follow-up' }));

    await waitFor(() => expect(openItems(section)).toHaveLength(2));
    expect(backend.reminders.some((r) => r.title === 'Send portfolio link')).toBe(false);
  });
});

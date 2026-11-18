import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';
import type { Contact } from '@/types/application';

let backend: ReturnType<typeof mockApplicationsBackend>;
let monzoId: string;

function setup({ contacts = [] as Omit<Contact, 'application_id'>[] } = {}) {
  backend = mockApplicationsBackend();
  const monzo = backend.applications.find((a) => a.company === 'Monzo');
  if (!monzo) throw new Error('sample data changed');
  monzoId = monzo.id;
  Object.assign(monzo, {
    salary_min: 75000,
    salary_max: 90000,
    salary_currency: 'GBP',
    source: 'LinkedIn',
    applied_on: '2026-11-02',
  });
  backend.contacts.push(...contacts.map((c) => ({ ...c, application_id: monzoId })));
}

beforeEach(() => {
  mockAuthBackend({ signedIn: true });
});

async function openMonzo() {
  const app = renderApp(`/applications/${monzoId}`);
  await findPageHeading('Monzo');
  return app;
}
const timeline = () => screen.getByRole('list', { name: 'History, newest first' });
const timelineText = () =>
  within(timeline())
    .getAllByRole('listitem')
    .map((li) => li.textContent);

const PRIYA = {
  id: 'contact-priya',
  name: 'Priya Shah',
  role: 'Recruiter',
  email: 'priya@monzo.com',
  phone: '+44 20 7946 0000',
  linkedin_url: null,
  notes: null,
};

describe('application detail page', () => {
  it('shows the application’s details, timeline and contacts', async () => {
    setup({ contacts: [PRIYA] });
    await openMonzo();

    expect(screen.getByText('Senior Frontend Engineer')).toBeVisible();
    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByText('£75,000 to £90,000')).toBeVisible();
    expect(within(details).getByText('LinkedIn')).toBeVisible();
    expect(within(details).getByText('2 Nov 2026')).toBeVisible();
    expect(within(details).getByRole('link', { name: /View the job ad/ })).toHaveAttribute(
      'target',
      '_blank',
    );
    await waitFor(() =>
      expect(timelineText()).toEqual([expect.stringMatching(/Added to Applied/)]),
    );
    const contacts = screen.getByRole('region', { name: 'Contacts' });
    expect(await within(contacts).findByText('Priya Shah')).toBeVisible();
    expect(within(contacts).getByRole('link', { name: 'priya@monzo.com' })).toHaveAttribute(
      'href',
      'mailto:priya@monzo.com',
    );
  });

  it('adds a note to the top of the timeline', async () => {
    setup();
    const user = userEvent.setup();
    await openMonzo();
    await waitFor(() => expect(timelineText()).toHaveLength(1));
    const note = screen.getByRole('textbox', { name: 'Add a note' });

    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Write a note first')).toBeVisible();

    await user.type(note, 'Call with Priya on Thursday.{Enter}Ask about the team.');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => expect(timelineText()).toHaveLength(2));
    expect(timelineText()[0]).toContain('Call with Priya on Thursday.\nAsk about the team.');
    expect(note).toHaveValue('');
  });

  it('changes the status, which the timeline records', async () => {
    setup();
    const user = userEvent.setup();
    await openMonzo();

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Interview' }));

    await waitFor(() => expect(timelineText()[0]).toMatch(/Moved from Applied\s*to\s*Interview/));
    expect(backend.applications.find((a) => a.id === monzoId)?.status).toBe('interview');
  });

  it('edits the application in the side panel', async () => {
    setup();
    const user = userEvent.setup();
    await openMonzo();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const panel = await screen.findByRole('dialog', { name: 'Edit Monzo' });
    const role = within(panel).getByLabelText('Role');
    await user.clear(role);
    await user.type(role, 'Staff Frontend Engineer');
    await user.click(within(panel).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Staff Frontend Engineer')).toBeVisible();
  });

  it('deletes only after confirming, then returns to the list with a toast', async () => {
    setup();
    const user = userEvent.setup();
    const app = await openMonzo();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    let confirm = await screen.findByRole('alertdialog', { name: 'Delete Monzo?' });
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(backend.calls).not.toContain('DELETE /applications');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    confirm = await screen.findByRole('alertdialog', { name: 'Delete Monzo?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete application' }));

    await findPageHeading('Applications');
    expect(app.location()).toBe('/applications');
    expect(await screen.findByText('Deleted Monzo')).toBeVisible();
    expect(backend.applications.some((a) => a.id === monzoId)).toBe(false);
  });

  it('keeps the page and explains when a delete fails', async () => {
    setup();
    server.use(
      http.delete('/api/v1/applications/:id', () =>
        HttpResponse.json({ detail: 'Database unavailable' }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    await openMonzo();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete application' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent(/can’t reach|unavailable/i);
    // Still on the page (hidden from the accessibility tree while the modal is open).
    expect(
      screen.getByRole('heading', { level: 1, name: 'Monzo', hidden: true }),
    ).toBeInTheDocument();
  });

  it('says so when the application doesn’t exist', async () => {
    setup();
    renderApp('/applications/does-not-exist');
    await findPageHeading('Application not found');
    expect(screen.getByRole('link', { name: 'All applications' })).toHaveAttribute(
      'href',
      '/applications',
    );
  });

  it('goes back to the filtered table it was opened from', async () => {
    setup();
    const user = userEvent.setup();
    const app = renderApp('/applications?view=table&status=applied');
    await screen.findByRole('table');

    await user.click(await screen.findByRole('link', { name: 'Monzo' }));
    await findPageHeading('Monzo');
    await user.click(screen.getByRole('link', { name: 'All applications' }));

    await screen.findByRole('table');
    expect(app.location()).toBe('/applications?view=table&status=applied');
  });
});

describe('contacts', () => {
  it('adds a contact, checking the fields first', async () => {
    setup();
    const user = userEvent.setup();
    await openMonzo();

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a contact' });
    await user.type(within(dialog).getByLabelText('Email'), 'priya@');
    await user.click(within(dialog).getByRole('button', { name: 'Add contact' }));
    expect(await within(dialog).findByText('Enter their name')).toBeVisible();
    expect(within(dialog).getByText(/Enter an email address/)).toBeVisible();

    await user.type(within(dialog).getByLabelText('Name'), 'Priya Shah');
    await user.type(within(dialog).getByLabelText('Email'), 'monzo.com');
    await user.click(within(dialog).getByRole('button', { name: 'Add contact' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Priya Shah')).toBeVisible();
    expect(backend.contacts[0]).toMatchObject({
      name: 'Priya Shah',
      email: 'priya@monzo.com',
      role: null,
    });
  });

  it('edits a contact, sending only the changes (emptying a field clears it)', async () => {
    setup({ contacts: [PRIYA] });
    const patches: unknown[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PATCH')
        void request
          .clone()
          .json()
          .then((b) => patches.push(b));
    });
    const user = userEvent.setup();
    await openMonzo();

    await user.click(await screen.findByRole('button', { name: 'Edit Priya Shah' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Priya Shah' });
    await user.clear(within(dialog).getByLabelText('Phone'));
    await user.clear(within(dialog).getByLabelText('Role'));
    await user.type(within(dialog).getByLabelText('Role'), 'Hiring manager');
    await user.click(within(dialog).getByRole('button', { name: 'Save contact' }));

    await waitFor(() => expect(screen.getByText('Hiring manager')).toBeVisible());
    expect(patches).toEqual([{ role: 'Hiring manager', phone: null }]);
    server.events.removeAllListeners();
  });

  it('deletes a contact after confirming', async () => {
    setup({ contacts: [PRIYA] });
    const user = userEvent.setup();
    await openMonzo();

    await user.click(await screen.findByRole('button', { name: 'Delete Priya Shah' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Priya Shah?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete contact' }));

    await waitFor(() => expect(screen.queryByText('Priya Shah')).not.toBeInTheDocument());
    expect(screen.getByText(/No contacts yet/)).toBeVisible();
    expect(backend.contacts).toEqual([]);
  });
});

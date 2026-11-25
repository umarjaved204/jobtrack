import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/lib/query-client';
import { makeApplication, makeResume, mockApplicationsBackend } from '@/test/fake-applications';
import { selectNames, unnamedFormFields } from '@/test/form-fields';
import { mockAuthBackend, server } from '@/test/msw';
import type { Application } from '@/types/application';

import { ApplicationFormSheet, type ApplicationFormMode } from './application-form-sheet';

let backend: ReturnType<typeof mockApplicationsBackend>;
const onSaved = vi.fn();

beforeEach(() => {
  onSaved.mockReset();
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend({
    tags: [{ id: 'tag-remote', name: 'Remote', color: 'cobalt' }],
  });
});

/** A page with the button that opens the panel, like the board and table will have. */
function Harness({ mode }: { mode: ApplicationFormMode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open form
      </button>
      <ApplicationFormSheet open={open} onOpenChange={setOpen} mode={mode} onSaved={onSaved} />
    </>
  );
}

async function openForm(mode: ApplicationFormMode = { type: 'create' }) {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Harness mode={mode} />
    </QueryClientProvider>,
  );
  const opener = screen.getByRole('button', { name: 'Open form' });
  await user.click(opener);
  const panel = await screen.findByRole('dialog', { name: /Add an application|Edit/ });
  return { user, opener, panel };
}

const field = (panel: HTMLElement, label: string) => within(panel).getByLabelText(label);

describe('ApplicationFormSheet: create', () => {
  it('gives every field an id or a name, the selects included (autofill)', async () => {
    const { panel } = await openForm();
    await waitFor(() =>
      expect(selectNames(panel)).toEqual(['status', 'work_mode', 'resume_version_id']),
    );
    expect(unnamedFormFields(panel)).toEqual([]);
  });

  it('adds an application, closes, and returns focus to the opener', async () => {
    const { user, opener, panel } = await openForm({ type: 'create', status: 'applied' });

    await user.type(field(panel, 'Company'), 'Skyscanner');
    await user.type(field(panel, 'Role'), 'Senior Frontend Engineer');
    await user.type(field(panel, 'Minimum'), '70,000');
    await user.type(field(panel, 'Currency'), 'gbp');
    await user.click(field(panel, 'Work mode'));
    await user.click(await screen.findByRole('option', { name: 'Hybrid' }));
    await user.click(within(panel).getByRole('button', { name: 'Add application' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const created = backend.applications.find((a) => a.company === 'Skyscanner');
    expect(created).toMatchObject({
      role_title: 'Senior Frontend Engineer',
      status: 'applied', // the column it was opened from
      work_mode: 'hybrid',
      salary_min: 70000,
      salary_currency: 'GBP',
      location: null,
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ company: 'Skyscanner' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('saves the chosen tags', async () => {
    const { user, panel } = await openForm();
    await user.type(field(panel, 'Company'), 'Linear');
    await user.type(field(panel, 'Role'), 'Product Engineer');
    await user.click(field(panel, 'Tags'));
    await user.click(await screen.findByRole('option', { name: /Remote/ }));
    await user.keyboard('{Escape}'); // closes the tag list, not the panel
    await user.click(within(panel).getByRole('button', { name: 'Add application' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(backend.applications.find((a) => a.company === 'Linear')?.tags).toEqual([
      { id: 'tag-remote', name: 'Remote', color: 'cobalt' },
    ]);
  });

  it('validates on the client and focuses the first problem', async () => {
    const { user, panel } = await openForm();
    await user.type(field(panel, 'Job link'), 'monzo.com/careers');
    await user.click(within(panel).getByRole('button', { name: 'Add application' }));

    expect(field(panel, 'Company')).toHaveFocus();
    expect(field(panel, 'Company')).toHaveAccessibleDescription('Enter the company');
    expect(field(panel, 'Job link')).toHaveAccessibleDescription(
      'Enter the full link, starting with https://',
    );
    expect(backend.calls).not.toContain('POST /applications');
  });

  it('shows server validation errors on their fields', async () => {
    server.use(
      http.post('/api/v1/applications', () =>
        HttpResponse.json(
          {
            detail: [
              { loc: ['body', 'job_url'], msg: 'URL must be at most 2048 characters', type: 'x' },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    const { user, panel } = await openForm();
    await user.type(field(panel, 'Company'), 'Monzo');
    await user.type(field(panel, 'Role'), 'Frontend Engineer');
    await user.click(within(panel).getByRole('button', { name: 'Add application' }));

    await waitFor(() =>
      expect(field(panel, 'Job link')).toHaveAccessibleDescription(
        'URL must be at most 2048 characters',
      ),
    );
    expect(screen.getByRole('dialog', { name: 'Add an application' })).toBeInTheDocument();
  });
});

describe('ApplicationFormSheet: edit', () => {
  it('starts from the application and sends only what changed', async () => {
    const monzo = backend.applications.find((a) => a.company === 'Monzo') as Application;
    let sent: unknown;
    server.use(
      http.patch('/api/v1/applications/:id', async ({ request }) => {
        sent = await request.clone().json();
        return undefined; // fall through to the fake backend
      }),
    );
    const { user, panel } = await openForm({ type: 'edit', application: monzo });

    expect(field(panel, 'Company')).toHaveValue('Monzo');
    expect(field(panel, 'Applied on')).toHaveValue(monzo.applied_on); // date-only string
    expect(field(panel, 'Apply by')).toHaveAccessibleDescription(
      'The last day to apply, if the ad gives one.',
    );
    await user.clear(field(panel, 'Location'));
    await user.type(field(panel, 'Location'), 'Remote (UK)');
    await user.click(within(panel).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent).toEqual({ location: 'Remote (UK)' });
  });

  it('closes without a request when nothing changed', async () => {
    const monzo = backend.applications.find((a) => a.company === 'Monzo') as Application;
    const { user, panel } = await openForm({ type: 'edit', application: monzo });

    await user.click(within(panel).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(backend.calls).not.toContain('PATCH /applications');
  });
});

describe('ApplicationFormSheet: closing', () => {
  it('closes straight away when nothing was typed', async () => {
    const { user, opener } = await openForm();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('asks before discarding unsaved changes', async () => {
    const { user, opener, panel } = await openForm();
    await user.type(field(panel, 'Company'), 'Wise');

    await user.keyboard('{Escape}');
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    expect(within(confirm).getByRole('button', { name: 'Keep editing' })).toHaveFocus();

    await user.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(field(panel, 'Company')).toHaveValue('Wise');

    await user.click(within(panel).getByRole('button', { name: 'Cancel' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(backend.calls).not.toContain('POST /applications');
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('asks from the × button too', async () => {
    const { user, panel } = await openForm({
      type: 'edit',
      application: makeApplication({ id: 'standalone' }),
    });
    await user.type(field(panel, 'Source'), ' (via a friend)');
    await user.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeVisible();
  });
});

describe('ApplicationFormSheet: resume sent', () => {
  const resumes = () => [
    makeResume({ id: 'resume-v1', label: 'Frontend v1', archived_at: '2026-09-01T10:00:00Z' }),
    makeResume({ id: 'resume-v2', label: 'Frontend v2' }),
    makeResume({ id: 'resume-v3', label: 'Frontend v3', is_default: true }),
  ];

  it('offers active versions (default marked) and sends the one chosen', async () => {
    backend = mockApplicationsBackend({ resumes: resumes() });
    const { user, panel } = await openForm({ type: 'create', status: 'applied' });
    await user.type(field(panel, 'Company'), 'Skyscanner');
    await user.type(field(panel, 'Role'), 'Frontend Engineer');

    await waitFor(() => expect(field(panel, 'Resume sent')).toBeEnabled());
    await user.click(field(panel, 'Resume sent'));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['None', 'Frontend v3 (default)', 'Frontend v2']); // default first
    await user.click(screen.getByRole('option', { name: 'Frontend v3 (default)' }));
    await user.click(within(panel).getByRole('button', { name: 'Add application' }));

    await waitFor(() =>
      expect(backend.applications.find((a) => a.company === 'Skyscanner')).toMatchObject({
        resume_version_id: 'resume-v3',
      }),
    );
  });

  it('keeps an archived version the application already used, marked as archived', async () => {
    const application = makeApplication({ id: 'deliveroo', resume_version_id: 'resume-v1' });
    backend = mockApplicationsBackend({ resumes: resumes(), applications: [application] });
    const { user, panel } = await openForm({ type: 'edit', application });

    await waitFor(() =>
      expect(field(panel, 'Resume sent')).toHaveTextContent('Frontend v1 (archived)'),
    );
    await user.type(field(panel, 'Source'), ' (via a friend)');
    await user.click(within(panel).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(backend.applications[0]?.resume_version_id).toBe('resume-v1');
  });

  it('points to the Resumes page when there are no versions yet', async () => {
    const { panel } = await openForm();
    expect(
      await within(panel).findByText('No versions yet: add them on the Resumes page.'),
    ).toBeVisible();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeApplication, makeResume, mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';
import type { Resume } from '@/types/resume';

let backend: ReturnType<typeof mockApplicationsBackend>;

const V3_TEXT = 'Sam Okafor\nProduct-minded frontend engineer\n\nReact, TypeScript, Next.js';

/** v3 (default, sent twice), v2 (unused), v1 (archived, sent once). */
function setup() {
  const v1 = makeResume({
    id: 'resume-v1',
    label: 'Frontend v1',
    archived_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
  });
  const v2 = makeResume({
    id: 'resume-v2',
    label: 'Frontend v2',
    updated_at: '2026-09-15T10:00:00Z',
  });
  const v3 = makeResume({
    id: 'resume-v3',
    label: 'Frontend v3',
    is_default: true,
    content_text: V3_TEXT,
    updated_at: '2026-10-20T10:00:00Z',
  });
  backend = mockApplicationsBackend({
    resumes: [v1, v2, v3],
    applications: [
      makeApplication({ company: 'Monzo', resume_version_id: 'resume-v3' }),
      makeApplication({ company: 'Wise', resume_version_id: 'resume-v3' }),
      makeApplication({ company: 'Deliveroo', resume_version_id: 'resume-v1' }),
    ],
  }); // prettier-ignore
}

beforeEach(() => {
  mockAuthBackend({ signedIn: true });
});

async function open(path = '/resumes') {
  const user = userEvent.setup();
  const app = renderApp(path);
  await findPageHeading('Resume versions');
  await waitFor(() =>
    expect(screen.queryByLabelText('Loading resume versions')).not.toBeInTheDocument(),
  );
  return { user, app };
}

const versions = (group: 'Active' | 'Archived') =>
  within(screen.getByRole('region', { name: new RegExp(`^${group}`) }))
    .getAllByRole('button')
    .map((b) => b.textContent);
const shownVersion = () => screen.findByRole('article');
const panel = () => screen.findByRole('dialog', { name: /version|Edit|Duplicate/ });
const backendResume = (label: string): Resume | undefined =>
  backend.resumes.find((r) => r.label === label);

describe('resumes page', () => {
  it('lists active versions (default first) apart from archived ones, and shows the default', async () => {
    setup();
    await open();

    expect(versions('Active')).toEqual([
      'Frontend v3DefaultSent with 2 applications',
      'Frontend v2Not sent yet',
    ]);
    expect(versions('Archived')).toEqual(['Frontend v1Sent with 1 application']);
    const article = await shownVersion();
    expect(within(article).getByRole('heading', { name: 'Frontend v3' })).toBeInTheDocument();
    expect(await within(article).findByText(/Product-minded frontend engineer/)).toBeVisible();
  });

  it('opens the version in the URL, and selecting one updates the URL', async () => {
    setup();
    const { user, app } = await open('/resumes?version=resume-v1');

    expect(within(await shownVersion()).getByText('Archived')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Frontend v2/ }));

    await waitFor(() => expect(app.location()).toBe('/resumes?version=resume-v2'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Frontend v2/ })).toHaveAttribute(
        'aria-current',
        'true',
      ),
    );
  });

  it('adds the first version from the empty state, counting characters as the server does', async () => {
    backend = mockApplicationsBackend({ resumes: [] });
    const { user } = await open();
    expect(screen.getByText('No resume versions yet')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Add a version' }));
    const form = await panel();
    await user.type(within(form).getByLabelText('Name'), 'Data v1');
    const text = within(form).getByLabelText('Resume text');
    text.focus();
    await user.paste('Sam Okafor\r\nSQL, dbt\r\n');
    expect(within(form).getByText('19 of 50,000 characters')).toBeVisible(); // trailing break trimmed
    await user.click(within(form).getByLabelText('Make this my default version'));
    await user.click(within(form).getByRole('button', { name: 'Add version' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(backendResume('Data v1')).toMatchObject({
      content_text: 'Sam Okafor\nSQL, dbt',
      is_default: true,
    });
    expect(within(await shownVersion()).getByRole('heading', { name: 'Data v1' })).toBeVisible();
    expect(await screen.findByText('Added Data v1')).toBeInTheDocument();
  });

  it('refuses text over the limit before sending it', async () => {
    backend = mockApplicationsBackend({ resumes: [] });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Add a version' }));
    const form = await panel();
    await user.type(within(form).getByLabelText('Name'), 'Too long');
    within(form).getByLabelText('Resume text').focus();
    await user.paste('a'.repeat(50_001));

    await user.click(within(form).getByRole('button', { name: 'Add version' }));

    expect(await within(form).findByText('Resumes can be up to 50,000 characters')).toBeVisible();
    expect(within(form).getByLabelText('Resume text')).toHaveAttribute('aria-invalid', 'true');
    expect(backend.calls).not.toContain('POST /resumes');
  });

  it('locks the text of a version that was sent, but lets it be renamed', async () => {
    setup();
    const { user } = await open();
    const article = await shownVersion();
    expect(within(article).getByText(/so its text is locked/)).toBeVisible();
    expect(within(article).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();

    await user.click(await within(article).findByRole('button', { name: 'Rename' }));
    const form = await panel();
    expect(within(form).getByLabelText('Resume text')).toHaveAttribute('readonly');
    const name = within(form).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Frontend v3 (sent)');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(backendResume('Frontend v3 (sent)')?.content_text).toBe(V3_TEXT);
  });

  it('duplicates a version as a new, editable copy', async () => {
    setup();
    const { user } = await open();
    const article = await shownVersion();

    await user.click(
      await within(article).findByRole('button', { name: 'Duplicate as new version' }),
    );
    const form = await panel();
    expect(within(form).getByLabelText('Name')).toHaveValue('Frontend v3 (copy)');
    const text = within(form).getByLabelText('Resume text');
    expect(text).toHaveValue(V3_TEXT);
    await user.type(text, '\nGraphQL');
    await user.click(within(form).getByRole('button', { name: 'Add version' }));

    await waitFor(() => expect(backendResume('Frontend v3 (copy)')).toBeDefined());
    expect(backendResume('Frontend v3 (copy)')).toMatchObject({
      content_text: `${V3_TEXT}\nGraphQL`,
      is_default: false,
    });
    expect(backendResume('Frontend v3')?.content_text).toBe(V3_TEXT); // the original is kept
  });

  it('makes a version the default', async () => {
    setup();
    const { user } = await open('/resumes?version=resume-v2');

    await user.click(within(await shownVersion()).getByRole('button', { name: 'Make default' }));

    await waitFor(() => expect(versions('Active')[0]).toMatch(/^Frontend v2Default/));
    expect(backend.resumes.filter((r) => r.is_default).map((r) => r.label)).toEqual([
      'Frontend v2',
    ]);
  });

  it('archives a version, offers undo, and restores it', async () => {
    setup();
    const { user } = await open();

    await user.click(within(await shownVersion()).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(versions('Archived')).toHaveLength(2));
    expect(backendResume('Frontend v3')).toMatchObject({ is_default: false });
    expect(await screen.findByText('Archived Frontend v3')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Restore' })); // still shown
    await waitFor(() => expect(versions('Archived')).toHaveLength(1));
    expect(backendResume('Frontend v3')?.archived_at).toBeNull();
  });

  it('deletes an unused version only after confirming', async () => {
    setup();
    const { user } = await open('/resumes?version=resume-v2');

    await user.click(within(await shownVersion()).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Frontend v2?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete version' }));

    await waitFor(() => expect(backendResume('Frontend v2')).toBeUndefined());
    expect(versions('Active')).toEqual(['Frontend v3DefaultSent with 2 applications']);
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeApplication, makeResume, mockApplicationsBackend } from '@/test/fake-applications';
import { FakeEmbeddingClient } from '@/test/fake-embedding-client';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';
import type { EmbeddingsMode } from '@/types/match';

/*
 * jsdom has no Web Worker, no model and no Cache API: the worker client, the browser
 * support check and the cache lookup are replaced, and each test sets them up.
 */
const runtime = vi.hoisted(() => ({
  client: null as FakeEmbeddingClient | null,
  unsupported: null as 'no-worker' | 'no-wasm' | 'no-simd' | null,
  cached: false,
}));

vi.mock('./embedding/embedding-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./embedding/embedding-client')>()),
  createEmbeddingClient: () => runtime.client,
}));
vi.mock('./embedding/support', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./embedding/support')>()),
  checkSupport: () => runtime.unsupported,
}));
vi.mock('./embedding/model-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./embedding/model-cache')>()),
  isModelCached: () => Promise.resolve(runtime.cached),
}));

const JD = 'Senior Frontend Engineer, Monzo\nRequirements:\n- React and TypeScript';
let backend: ReturnType<typeof mockApplicationsBackend>;

function setup({
  mode = 'client',
  resumes = [
    makeResume({ id: 'resume-v1', label: 'Frontend v1' }),
    makeResume({ id: 'resume-v2', label: 'Frontend v2', is_default: true }),
  ],
}: { mode?: EmbeddingsMode; resumes?: ReturnType<typeof makeResume>[] } = {}) {
  runtime.client = new FakeEmbeddingClient();
  runtime.unsupported = null;
  runtime.cached = false;
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend({
    resumes,
    applications: [makeApplication({ id: 'app-monzo', company: 'Monzo', role_title: 'Frontend Engineer' })], // prettier-ignore
    matchEmbeddings: mode,
  });
}

async function openPage(path = '/match') {
  const user = userEvent.setup();
  renderApp(path);
  await findPageHeading('Match a job description');
  await screen.findByLabelText('Job description'); // the form, once config and resumes load
  return user;
}

async function fillAndRun(user: ReturnType<typeof userEvent.setup>, jd = JD) {
  await user.type(await screen.findByLabelText('Job description'), jd);
  await user.click(screen.getByRole('button', { name: 'Match' }));
}

beforeEach(() => setup());

describe('match page: running a match', () => {
  it('asks before the first download, then shows the score', async () => {
    const user = await openPage();
    await fillAndRun(user);

    const dialog = await screen.findByRole('dialog', { name: 'Download the match model?' });
    expect(dialog).toHaveTextContent('about 35 MB');
    expect(backend.calls).not.toContain('POST /match/prepare');

    await user.click(within(dialog).getByRole('button', { name: 'Download and match' }));
    const card = await screen.findByRole('article', { name: 'Match score' });
    expect(card).toHaveTextContent(`${backend.matches[0]?.score} out of 100`);
    expect(backend.matches[0]?.resume_version_id).toBe('resume-v2'); // the default first
    expect(runtime.client?.loads).toHaveLength(1);

    // Once agreed, the page doesn't ask again.
    await user.click(screen.getByRole('button', { name: 'Match' }));
    await waitFor(() => expect(backend.matches).toHaveLength(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs nothing when the download is declined', async () => {
    const user = await openPage();
    await fillAndRun(user);
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(backend.calls).not.toContain('POST /match/prepare');
  });

  it('doesn’t ask when the model is already in the browser', async () => {
    runtime.cached = true;
    const user = await openPage();
    await fillAndRun(user);
    expect(await screen.findByRole('article', { name: 'Match score' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('matches the chosen resume, linked to the chosen application', async () => {
    runtime.cached = true;
    const user = await openPage();
    await user.click(screen.getByRole('combobox', { name: 'Resume' }));
    await user.click(await screen.findByRole('option', { name: 'Frontend v1' }));
    await user.click(screen.getByRole('combobox', { name: 'Application' }));
    await user.click(await screen.findByRole('option', { name: /Monzo/ }));
    await fillAndRun(user);

    await screen.findByRole('article', { name: 'Match score' });
    expect(backend.matches[0]).toMatchObject({
      resume_version_id: 'resume-v1',
      application_id: 'app-monzo',
    });
  });

  it('pre-selects the application from an application page’s link', async () => {
    runtime.cached = true;
    const user = await openPage('/match?application=app-monzo');
    expect(screen.getByRole('combobox', { name: 'Application' })).toHaveTextContent('Monzo');
    await fillAndRun(user);

    await screen.findByRole('article', { name: 'Match score' });
    expect(backend.matches[0]).toMatchObject({
      resume_version_id: 'resume-v2', // the default
      application_id: 'app-monzo',
    });
  });

  it('adds a linked application older than the picker’s recent list', async () => {
    const old = makeApplication({ id: 'app-wise', company: 'Wise', role_title: 'Web Engineer' });
    backend.applications.push(old);
    // The recent list (most recently updated first) doesn't reach it.
    server.use(
      http.get(
        '/api/v1/applications',
        () =>
        HttpResponse.json({ items: [backend.applications[0]], total: 2, page: 1, page_size: 100, pages: 1 }), // prettier-ignore
      ),
    );
    const user = await openPage('/match?application=app-wise');

    const picker = screen.getByRole('combobox', { name: 'Application' });
    expect(picker).toHaveTextContent('Wise');
    await user.click(picker);
    expect(await screen.findByRole('option', { name: /Wise/ })).toBeVisible();
    expect(screen.getByRole('option', { name: /Monzo/ })).toBeVisible();
  });

  it('starts unlinked when the linked application doesn’t exist', async () => {
    await openPage('/match?application=app-gone');
    expect(screen.getByRole('combobox', { name: 'Application' })).toHaveTextContent('Not linked');
  });

  it('shows progress, and Cancel stops the run without saving', async () => {
    runtime.cached = true;
    (runtime.client as FakeEmbeddingClient).hold = true;
    const user = await openPage();
    await fillAndRun(user);

    const panel = await screen.findByRole('region', { name: 'Match in progress' });
    expect(within(panel).getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByLabelText('Job description')).toHaveAttribute('readonly');

    await user.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Match in progress' })).not.toBeInTheDocument();
    expect(runtime.client?.disposed).toBe(true);
    expect(backend.matches).toEqual([]);
    expect(screen.getByLabelText('Job description')).not.toHaveAttribute('readonly');
  });

  it('lets the server embed in server mode, without asking', async () => {
    setup({ mode: 'server' });
    const user = await openPage();
    await fillAndRun(user);
    expect(await screen.findByRole('article', { name: 'Match score' })).toBeVisible();
    expect(runtime.client?.loads).toEqual([]);
    expect(screen.queryByText(/runs on your device/)).not.toBeInTheDocument();
  });
});

describe('match page: problems', () => {
  it('checks the job description before sending anything', async () => {
    const user = await openPage();
    await user.click(screen.getByRole('button', { name: 'Match' }));
    expect(await screen.findByText('Paste the job description')).toBeVisible();
    expect(screen.getByLabelText('Job description')).toHaveAttribute('aria-invalid', 'true');
    expect(backend.calls).not.toContain('POST /match/prepare');
  });

  it('puts a server field error on its field', async () => {
    runtime.cached = true;
    server.use(
      http.post('/api/v1/match/prepare', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'jd_text'], msg: 'Job description has too many lines to match (over 300)', type: 'value_error' }] }, // prettier-ignore
          { status: 422 },
        ),
      ),
    );
    const user = await openPage();
    await fillAndRun(user);
    expect(await screen.findByText(/too many lines to match/)).toBeVisible();
    expect(screen.getByLabelText('Job description')).toHaveAttribute('aria-invalid', 'true');
  });

  it('explains a failed run', async () => {
    runtime.cached = true;
    runtime.client = new FakeEmbeddingClient();
    runtime.client.failOn = { step: 'load', reason: 'download-failed' };
    const user = await openPage();
    await fillAndRun(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The match didn’t finish');
    expect(alert).toHaveTextContent(/couldn’t download/);
  });

  it('says when matching is switched off', async () => {
    setup({ mode: 'off' });
    renderApp('/match');
    await findPageHeading('Match a job description'); // the page fades in
    expect(await screen.findByRole('heading', { name: 'Matching is switched off' })).toBeVisible();
    expect(screen.queryByLabelText('Job description')).not.toBeInTheDocument();
  });

  it('explains when the browser can’t run the model', async () => {
    runtime.unsupported = 'no-simd';
    renderApp('/match');
    await findPageHeading('Match a job description');
    expect(
      await screen.findByRole('heading', { name: 'This browser can’t run the match' }),
    ).toBeVisible();
    expect(screen.getByText(/lacks SIMD/)).toBeVisible();
  });

  it('asks for a resume first when there are none to match', async () => {
    setup({ resumes: [makeResume({ archived_at: '2026-10-01T00:00:00Z' })] });
    renderApp('/match');
    await findPageHeading('Match a job description');
    expect(
      await screen.findByRole('heading', { name: 'Add a resume to match against' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add a resume' })).toHaveAttribute('href', '/resumes');
  });
});

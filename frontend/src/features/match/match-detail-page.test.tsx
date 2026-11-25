import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMatch, makeResume, mockApplicationsBackend } from '@/test/fake-applications';
import { FakeEmbeddingClient } from '@/test/fake-embedding-client';
import { mockAuthBackend } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';
import type { Match } from '@/types/match';

// The match page loads the worker client and checks the browser; jsdom has neither.
vi.mock('./embedding/embedding-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./embedding/embedding-client')>()),
  createEmbeddingClient: () => new FakeEmbeddingClient(),
}));
vi.mock('./embedding/support', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./embedding/support')>()),
  checkSupport: () => null,
}));

const at = (day: number) => `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`;

function setup(matches: Match[]) {
  mockAuthBackend({ signedIn: true });
  return mockApplicationsBackend({
    resumes: [
      makeResume({ id: 'resume-v1', label: 'Frontend v1' }),
      makeResume({ id: 'resume-v2', label: 'Frontend v2', is_default: true }),
    ],
    matches,
  });
}

describe('match history', () => {
  beforeEach(() => {
    setup([
      makeMatch({ id: 'm-old', score: 31, jd_excerpt: 'Backend Engineer, Wise', created_at: at(2), is_current: false }), // prettier-ignore
      makeMatch({ id: 'm-new', score: 82, jd_excerpt: 'Frontend Engineer, Monzo', company: 'Monzo', created_at: at(9) }), // prettier-ignore
    ]);
  });

  it('lists past matches newest first, each linking to its result', async () => {
    renderApp('/match');
    const history = await screen.findByRole('region', { name: 'Earlier matches' });
    const table = await within(history).findByRole('table');
    const links = within(table).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/match/m-new',
      '/match/m-old',
    ]);
    expect(links.map((link) => link.textContent)).toEqual(['Monzo', 'Backend Engineer, Wise']);
    const [, newer, older] = within(table).getAllByRole('row');
    expect(newer).toHaveTextContent('82 Strong overlap');
    expect(older).toHaveTextContent('31 Older version');
    expect(within(history).getByRole('link', { name: 'delete them in Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});

describe('paging the history', () => {
  it('pages ten at a time', async () => {
    setup(Array.from({ length: 11 }, (_, i) => makeMatch({ jd_excerpt: `Advert ${i + 1}`, created_at: at(i + 1) }))); // prettier-ignore
    const user = userEvent.setup();
    renderApp('/match');
    const history = await screen.findByRole('region', { name: 'Earlier matches' });
    const table = await within(history).findByRole('table');
    expect(within(table).getAllByRole('link')).toHaveLength(10);
    expect(within(history).getByText('Page 1 of 2')).toBeVisible();

    await user.click(within(history).getByRole('button', { name: 'Older' }));
    expect(await within(history).findByText('Page 2 of 2')).toBeVisible();
    expect(await within(history).findByRole('link', { name: /Advert 1\b/ })).toBeVisible();
    expect(within(history).getByRole('button', { name: 'Older' })).toBeDisabled();
  });
});

describe('match detail page', () => {
  it('shows the result and the job description it was run against', async () => {
    setup([makeMatch({ id: 'm-1', company: 'Monzo', application_id: null, jd_excerpt: 'Senior Frontend Engineer, Monzo' })]); // prettier-ignore
    renderApp('/match/m-1');
    await findPageHeading('Monzo match');
    expect(screen.getByRole('article', { name: 'Match score' })).toHaveTextContent('72 out of 100');
    expect(screen.getByText('The job description')).toBeVisible();
    expect(screen.getByRole('link', { name: 'All matches' })).toHaveAttribute('href', '/match');
  });

  it('says when a match doesn’t exist', async () => {
    setup([]);
    renderApp('/match/missing');
    await findPageHeading('Match not found');
  });

  it('runs again with the same inputs, pre-filled on the match page', async () => {
    setup([
      makeMatch({
        id: 'm-1',
        resume_version_id: 'resume-v1',
        jd_text: 'Frontend Engineer\n- React',
        is_current: false,
      }),
    ]);
    const user = userEvent.setup();
    const app = renderApp('/match/m-1');
    await findPageHeading('Match result');
    await user.click(screen.getAllByRole('button', { name: 'Run again' })[0] as HTMLElement);

    await findPageHeading('How well does a resume fit the job?');
    expect(app.location()).toBe('/match');
    expect(await screen.findByLabelText('Job description')).toHaveValue(
      'Frontend Engineer\n- React',
    );
    expect(screen.getByRole('combobox', { name: 'Resume' })).toHaveTextContent('Frontend v1');
  });

  it('falls back to the default resume when the old one is no longer active', async () => {
    setup([makeMatch({ id: 'm-1', resume_version_id: 'resume-archived', jd_text: 'Role' })]);
    const user = userEvent.setup();
    renderApp('/match/m-1');
    await findPageHeading('Match result');
    await user.click(screen.getByRole('button', { name: 'Run again' }));
    await findPageHeading('How well does a resume fit the job?');
    expect(await screen.findByRole('combobox', { name: 'Resume' })).toHaveTextContent(
      'Frontend v2',
    );
  });
});

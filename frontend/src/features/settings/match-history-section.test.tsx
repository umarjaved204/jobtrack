// Before anything else: the app's shared vector store looks for IndexedDB on first use.
import 'fake-indexeddb/auto';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { createChunkVectorCache, sharedVectorStore } from '@/features/match/vector-cache';
import { makeMatch, makeResume, mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server, testUser } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

const model = { id: 'Xenova/bge-small-en-v1.5', revision: 'a'.repeat(40), dtype: 'q8', dim: 3 } as const; // prettier-ignore
const CHUNK = 'React and TypeScript';

async function setup() {
  mockAuthBackend({ signedIn: true });
  const resume = makeResume({ id: 'resume-v1', label: 'Frontend v1', match_count: 2 });
  const backend = mockApplicationsBackend({
    resumes: [resume],
    matches: [
      makeMatch({ resume_version_id: resume.id }),
      makeMatch({ resume_version_id: resume.id }),
    ],
  });
  const vectors = createChunkVectorCache({ userId: testUser.id, store: sharedVectorStore() });
  await vectors.store(model, [CHUNK], [Float32Array.from([1, 0, 0])]);

  const user = userEvent.setup();
  renderApp('/settings');
  await findPageHeading('Settings');
  const section = screen.getByRole('region', { name: 'Match history' });
  await within(section).findByText(/You have 2 saved matches/);
  return { user, backend, vectors, section };
}

describe('MatchHistorySection', () => {
  it('deletes the history and this browser’s cached vectors after confirming', async () => {
    const { user, backend, vectors, section } = await setup();

    await user.click(within(section).getByRole('button', { name: 'Delete match history' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete your match history?' });
    expect(dialog).toHaveTextContent('All 2 saved matches');
    await user.click(within(dialog).getByRole('button', { name: 'Delete match history' }));

    expect(await screen.findByText('Match history deleted')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(backend.calls).toContain('DELETE /match');
    expect(backend.matches).toEqual([]);
    expect(backend.resumes[0]?.match_count).toBe(0);
    expect(await within(section).findByText(/You have 0 saved matches/)).toBeVisible();
    expect(await vectors.lookup(model, [CHUNK])).toEqual([undefined]);
  });

  it('keeps everything when cancelled', async () => {
    const { user, backend, vectors, section } = await setup();

    await user.click(within(section).getByRole('button', { name: 'Delete match history' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(backend.calls).not.toContain('DELETE /match');
    expect(backend.matches).toHaveLength(2);
    expect((await vectors.lookup(model, [CHUNK]))[0]).toBeDefined();
  });

  it('reports a failure in the dialog and keeps the cached vectors', async () => {
    const { user, vectors, section } = await setup();
    server.use(
      http.delete('/api/v1/match', () =>
        HttpResponse.json({ detail: 'Something went wrong on our side.' }, { status: 500 }),
      ),
    );

    await user.click(within(section).getByRole('button', { name: 'Delete match history' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete match history' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side.',
    );
    expect((await vectors.lookup(model, [CHUNK]))[0]).toBeDefined();
  });
});

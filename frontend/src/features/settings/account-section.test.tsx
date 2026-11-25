// Before anything else: the match history section and the vector cache use IndexedDB.
import 'fake-indexeddb/auto';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { createChunkVectorCache, sharedVectorStore } from '@/features/match/vector-cache';
import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server, testUser } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

const model = { id: 'Xenova/bge-small-en-v1.5', revision: 'a'.repeat(40), dtype: 'q8', dim: 3 } as const; // prettier-ignore

async function setup() {
  const auth = mockAuthBackend({ signedIn: true });
  mockApplicationsBackend();
  const user = userEvent.setup();
  const app = renderApp('/settings');
  await findPageHeading('Settings');
  const section = screen.getByRole('region', { name: 'Account' });
  await user.click(within(section).getByRole('button', { name: 'Delete account…' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete your account?' });
  return {
    user,
    auth,
    app,
    dialog,
    input: within(dialog).getByLabelText(`Type ${testUser.email} to confirm`),
    confirm: within(dialog).getByRole('button', { name: 'Delete my account' }),
  };
}

describe('AccountSection', () => {
  it('deletes only once the email is typed, then signs out to the login page', async () => {
    const vectors = createChunkVectorCache({ userId: testUser.id, store: sharedVectorStore() });
    await vectors.store(model, ['React'], [Float32Array.from([1, 0, 0])]);
    const { user, auth, app, input, confirm } = await setup();

    expect(confirm).toBeDisabled();
    await user.type(input, 'someone.else@example.com');
    expect(confirm).toBeDisabled();
    await user.clear(input);
    await user.type(input, ` ${testUser.email.toUpperCase()} `);
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(app.location()).toBe('/login?reason=deleted'));
    expect(auth.calls).toContain('delete-me');
    expect(
      await screen.findByText('Your account and everything in it have been deleted.'),
    ).toBeVisible();
    expect(app.queryClient.getQueryData(['session']) ?? null).toBeNull(); // signed out
    await waitFor(async () => expect(await vectors.lookup(model, ['React'])).toEqual([undefined]));
  });

  it('submits with Enter once confirmed', async () => {
    const { user, auth, app, input } = await setup();

    await user.type(input, `${testUser.email}{Enter}`);

    await waitFor(() => expect(app.location()).toBe('/login?reason=deleted'));
    expect(auth.calls).toContain('delete-me');
  });

  it('keeps the account when cancelled', async () => {
    const { user, auth, app, dialog } = await setup();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(auth.calls).not.toContain('delete-me');
    expect(app.location()).toBe('/settings');
  });

  it('explains a failed delete and stays signed in', async () => {
    const { user, app, dialog, input, confirm } = await setup();
    server.use(
      http.delete('/api/v1/users/me', () =>
        HttpResponse.json({ detail: 'Can’t delete right now' }, { status: 503 }),
      ),
    );

    await user.type(input, testUser.email);
    await user.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/reach JobTrack|right now/);
    expect(app.location()).toBe('/settings');
    expect(app.queryClient.getQueryData(['session'])).toMatchObject({ email: testUser.email });
  });
});

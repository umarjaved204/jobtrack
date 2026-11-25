// Before anything else: the match history section on the same page reads IndexedDB.
import 'fake-indexeddb/auto';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { accentColors } from '@/lib/palette';
import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

async function setup() {
  const auth = mockAuthBackend({ signedIn: true });
  mockApplicationsBackend();
  const user = userEvent.setup();
  renderApp('/settings');
  await findPageHeading('Settings');
  const section = screen.getByRole('region', { name: 'Appearance' });
  return {
    user,
    auth,
    edition: within(within(section).getByRole('group', { name: 'Edition' })),
    accent: within(within(section).getByRole('group', { name: 'Accent' })),
  };
}

describe('AppearanceSection', () => {
  it('offers the three editions and every accent, with the current ones checked', async () => {
    const { edition, accent } = await setup();

    expect(edition.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'JobTrackBroadsheetInk on paper, the default.',
      'JobTrackNight editionCream on night paper, for the evening.',
      'JobTrackMatch systemSwitches with your device’s setting.',
    ]);
    expect(edition.getByRole('radio', { name: /Match system/ })).toBeChecked();
    expect(accent.getAllByRole('radio')).toHaveLength(accentColors.length);
    expect(accent.getByRole('radio', { name: 'Vermilion' })).toBeChecked();
  });

  it('applies a theme at once and saves it to the profile', async () => {
    const { user, auth, edition } = await setup();

    await user.click(edition.getByRole('radio', { name: /Night edition/ }));

    expect(document.documentElement).toHaveClass('dark');
    expect(edition.getByRole('radio', { name: /Night edition/ })).toBeChecked();
    await waitFor(() => expect(auth.user.theme).toBe('dark'));
  });

  it('moves between accents with the arrow keys, saving each', async () => {
    const { user, auth, accent } = await setup();

    await user.click(accent.getByRole('radio', { name: 'Vermilion' }));
    await user.keyboard('{ArrowRight}');

    expect(accent.getByRole('radio', { name: 'Cobalt' })).toHaveFocus();
    expect(accent.getByRole('radio', { name: 'Cobalt' })).toBeChecked();
    expect(document.documentElement.dataset['accent']).toBe('cobalt');
    await waitFor(() => expect(auth.user.accent).toBe('cobalt'));
  });

  it('goes back to the previous accent if the save fails', async () => {
    const { user, accent } = await setup();
    server.use(
      http.patch('/api/v1/users/me', () => HttpResponse.json({ detail: 'Boom' }, { status: 500 })),
    );

    await user.click(accent.getByRole('radio', { name: 'Plum' }));

    await waitFor(() => expect(accent.getByRole('radio', { name: 'Vermilion' })).toBeChecked());
    expect(document.documentElement.dataset['accent']).toBe('vermilion');
  });
});

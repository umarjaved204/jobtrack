// Before anything else: the match history section reads IndexedDB.
import 'fake-indexeddb/auto';

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

describe('SettingsPage', () => {
  it('links each section from the side nav, in page order', async () => {
    mockAuthBackend({ signedIn: true });
    mockApplicationsBackend();
    renderApp('/settings');
    await findPageHeading('Settings');

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Profile', '#profile'],
      ['Appearance', '#appearance'],
      ['Your data', '#data'],
      ['Account', '#account'],
    ]);
    for (const link of links) {
      const id = link.getAttribute('href')?.slice(1) ?? '';
      const target = document.getElementById(id);
      expect(target).toHaveAccessibleName(link.textContent ?? '');
      expect(target).toHaveRole('region');
    }
    const data = screen.getByRole('region', { name: 'Your data' });
    expect(
      within(data)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Export everything', 'Match history']);
  });
});

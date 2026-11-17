import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { THEME_COLORS } from '@/lib/theme';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

import indexHtml from '../../../index.html?raw';

async function chooseAccent(name: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Appearance' }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
}

describe('theme preference while signed in', () => {
  it('applies immediately and saves to the profile', async () => {
    const backend = mockAuthBackend({ signedIn: true });
    const app = renderApp('/dashboard');
    await findPageHeading('Dashboard');

    await chooseAccent(/teal/i);

    expect(document.documentElement.dataset['accent']).toBe('teal');
    await waitFor(() => expect(backend.user.accent).toBe('teal'));
    expect(backend.calls).toContain('patch-me');
    expect(app.queryClient.getQueryData(['session'])).toMatchObject({ accent: 'teal' });
  });

  it('reverts if the profile could not be saved', async () => {
    mockAuthBackend({ signedIn: true });
    renderApp('/dashboard');
    await findPageHeading('Dashboard');
    server.use(
      http.patch('/api/v1/users/me', () => HttpResponse.json({ detail: 'Boom' }, { status: 500 })),
    );

    await chooseAccent(/plum/i);

    await waitFor(() => expect(document.documentElement.dataset['accent']).toBe('vermilion'));
  });
});

describe('pre-paint theme script (index.html)', () => {
  beforeEach(() => {
    // A cold page load: nothing applied to <html> yet.
    document.documentElement.className = '';
    delete document.documentElement.dataset['accent'];
  });

  /** Runs the inline <script> from index.html, exactly as the browser would before React. */
  function runBootstrapScript() {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
    const inline = [...doc.querySelectorAll('script')].find((s) => !s.src && !s.type);
    expect(inline, 'inline theme script in index.html').toBeDefined();
    new Function(inline?.textContent ?? '')();
  }

  it('applies the cached theme, accent and browser colour before React mounts', () => {
    localStorage.setItem('jobtrack:theme', 'dark');
    localStorage.setItem('jobtrack:accent', 'forest');
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);

    runBootstrapScript();

    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.dataset['accent']).toBe('forest');
    expect(meta.content).toBe(THEME_COLORS.dark);
    meta.remove();
  });

  it('ignores a malformed cached accent', () => {
    localStorage.setItem('jobtrack:accent', '"><img src=x onerror=alert(1)>');
    runBootstrapScript();
    expect(document.documentElement.dataset['accent']).toBeUndefined();
  });

  it('falls back to light when nothing is cached and the OS is light', () => {
    runBootstrapScript();
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

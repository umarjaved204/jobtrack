// Before anything else: the match history section on the same page reads IndexedDB.
import 'fake-indexeddb/auto';

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from '@/lib/save-file';
import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

const requests: string[] = [];

function exportHandler(response: () => Response) {
  server.use(
    http.get('/api/v1/export', ({ request }) => {
      requests.push(new URL(request.url).search);
      return response();
    }),
  );
}

async function setup() {
  mockAuthBackend({ signedIn: true });
  mockApplicationsBackend();
  const user = userEvent.setup();
  renderApp('/settings');
  await findPageHeading('Settings');
  return { user, section: screen.getByRole('region', { name: 'Export everything' }) };
}

beforeEach(() => {
  requests.length = 0;
  vi.mocked(saveFile).mockClear();
});

describe('ExportSection', () => {
  it.each([
    ['Download CSV', '?format=csv', 'jobtrack-export-2026-11-25.zip'],
    ['Download JSON', '?format=json', 'jobtrack-export-2026-11-25.json'],
  ])('%s saves the file the server sends', async (button, query, filename) => {
    exportHandler(
      () =>
        new HttpResponse('data', {
          headers: { 'Content-Disposition': `attachment; filename="${filename}"` },
        }),
    );
    const { user, section } = await setup();

    await user.click(within(section).getByRole('button', { name: button }));

    expect(await screen.findByText(`Downloaded ${filename}`)).toBeVisible();
    expect(requests).toEqual([query]);
    expect(saveFile).toHaveBeenCalledOnce();
    const [blob, name] = vi.mocked(saveFile).mock.calls[0] ?? [];
    expect(name).toBe(filename);
    expect(await blob?.text()).toBe('data');
  });

  it('describes each format', async () => {
    const { section } = await setup();

    expect(
      within(section).getByRole('button', { name: 'Download CSV' }),
    ).toHaveAccessibleDescription('A zip of spreadsheets, one per table.');
    expect(
      within(section).getByRole('button', { name: 'Download JSON' }),
    ).toHaveAccessibleDescription('One file, for backups and scripts.');
  });

  it('explains a failed export and saves nothing', async () => {
    exportHandler(() => HttpResponse.json({ detail: 'Not available right now' }, { status: 409 }));
    const { user, section } = await setup();

    await user.click(within(section).getByRole('button', { name: 'Download JSON' }));

    const alert = await within(section).findByRole('alert');
    expect(alert).toHaveTextContent('The export didn’t download');
    expect(alert).toHaveTextContent('Not available right now');
    expect(saveFile).not.toHaveBeenCalled();
    expect(within(section).getByRole('button', { name: 'Download JSON' })).toBeEnabled();
  });
});

// Before anything else: the match history section on the same page reads IndexedDB.
import 'fake-indexeddb/auto';

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server, testUser } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

async function setup() {
  const auth = mockAuthBackend({ signedIn: true });
  mockApplicationsBackend();
  const user = userEvent.setup();
  renderApp('/settings');
  await findPageHeading('Settings');
  const section = screen.getByRole('region', { name: 'Profile' });
  return { user, auth, section, name: within(section).getByLabelText('Full name') };
}

describe('ProfileSection', () => {
  it('shows the name to edit and the sign-in email read-only', async () => {
    const { section, name } = await setup();

    expect(name).toHaveValue(testUser.full_name);
    const email = within(section).getByLabelText('Email');
    expect(email).toHaveValue(testUser.email);
    expect(email).toHaveAttribute('readonly');
    expect(email).toHaveAccessibleDescription(/can’t be changed yet/);
  });

  it('saves a new name, trimmed, and the account menu shows it', async () => {
    const { user, auth, section, name } = await setup();

    await user.clear(name);
    await user.type(name, '  Samuel Okafor ');
    await user.click(within(section).getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Profile saved')).toBeVisible();
    expect(auth.calls).toContain('patch-me');
    expect(auth.user.full_name).toBe('Samuel Okafor');
    expect(name).toHaveValue('Samuel Okafor');
    expect(screen.getByRole('button', { name: 'Account: Samuel Okafor' })).toBeVisible();
  });

  it('asks for a name before sending anything', async () => {
    const { user, auth, section, name } = await setup();

    await user.clear(name);
    await user.type(name, '   ');
    await user.click(within(section).getByRole('button', { name: 'Save profile' }));

    expect(await within(section).findByText('Enter your name')).toBeVisible();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(auth.calls).not.toContain('patch-me');
  });

  it('puts a server field error on the field', async () => {
    const { user, section, name } = await setup();
    server.use(
      http.patch('/api/v1/users/me', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'full_name'], msg: 'That name is too long', type: 'x' }] },
          { status: 422 },
        ),
      ),
    );

    await user.type(name, ' Jr');
    await user.click(within(section).getByRole('button', { name: 'Save profile' }));

    expect(await within(section).findByText('That name is too long')).toBeVisible();
    expect(name).toHaveFocus();
  });

  it('explains a failed save and keeps what was typed', async () => {
    const { user, auth, section, name } = await setup();
    server.use(
      http.patch('/api/v1/users/me', () =>
        HttpResponse.json({ detail: 'Profile changes are paused' }, { status: 409 }),
      ),
    );

    await user.type(name, ' Jr');
    await user.click(within(section).getByRole('button', { name: 'Save profile' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Profile changes are paused',
    );
    expect(name).toHaveValue(`${testUser.full_name} Jr`);
    expect(auth.user.full_name).toBe(testUser.full_name);
    expect(screen.getByRole('button', { name: `Account: ${testUser.full_name}` })).toBeVisible();
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeApplication, mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';
import type { ApplicationStatus } from '@/types/application';

import { CELEBRATION_MS } from './celebration-store';
import { CONFETTI_COUNT } from './confetti';

const stamp = () => document.querySelector('[data-slot="offer-stamp"]');
const overlay = () => document.querySelector('[data-slot="offer-celebration"]');
const scraps = () => overlay()?.querySelectorAll('span').length ?? 0;
const announced = () =>
  [...document.querySelectorAll('[aria-live]')].map((n) => n.textContent).join(' | ');

function setup(status: ApplicationStatus = 'interview') {
  mockAuthBackend({ signedIn: true });
  mockApplicationsBackend({
    applications: [
      makeApplication({
        id: 'app-monzo',
        company: 'Monzo',
        role_title: 'Senior Frontend Engineer',
        status,
        position: 1024,
      }),
      makeApplication({
        id: 'app-wise',
        company: 'Wise',
        role_title: 'Product Engineer',
        status: 'offer',
        position: 1024,
      }),
    ],
  });
}

async function setDetailStatus(label: string) {
  const user = userEvent.setup();
  renderApp('/applications/app-monzo');
  await findPageHeading('Monzo');
  await user.click(screen.getByRole('combobox', { name: 'Status' }));
  await user.click(await screen.findByRole('option', { name: label }));
  return user;
}

describe('offer celebration', () => {
  beforeEach(() => setup());

  it('stamps the page, throws confetti and announces it when the status becomes Offer', async () => {
    await setDetailStatus('Offer');

    await waitFor(() => expect(stamp()).toHaveTextContent('Offer'));
    expect(stamp()).toHaveTextContent('Received · Monzo');
    expect(scraps()).toBe(CONFETTI_COUNT);
    // Decorative for assistive tech, which hears the sentence instead.
    expect(overlay()).toHaveAttribute('aria-hidden', 'true');
    expect(announced()).toContain('Offer received from Monzo. Congratulations!');
  });

  it('leaves on Escape', async () => {
    const user = await setDetailStatus('Offer');
    await waitFor(() => expect(stamp()).not.toBeNull());

    await user.keyboard('{Escape}');
    await waitFor(() => expect(overlay()).toBeNull());
  });

  it('leaves by itself', async () => {
    await setDetailStatus('Offer');
    await waitFor(() => expect(stamp()).not.toBeNull());
    await waitFor(() => expect(overlay()).toBeNull(), { timeout: CELEBRATION_MS + 1500 });
  });

  it('stays quiet for other statuses', async () => {
    await setDetailStatus('Rejected');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Rejected')); // prettier-ignore
    expect(overlay()).toBeNull();
  });

  it('celebrates a move into the offer column from the board', async () => {
    const user = userEvent.setup();
    renderApp('/applications');
    await findPageHeading('Applications');
    await user.click(
      await screen.findByRole('button', { name: 'Move to… Monzo, Senior Frontend Engineer' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Offer' }));

    await waitFor(() => expect(stamp()).toHaveTextContent('Received · Monzo'));
  });

  it('is a gentle fade with reduced motion: the stamp, but no confetti', async () => {
    const real = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
      query === '(prefers-reduced-motion: reduce)'
        ? ({ ...real(query), matches: true, media: query } as MediaQueryList)
        : real(query),
    );
    await setDetailStatus('Offer');

    await waitFor(() => expect(stamp()).not.toBeNull());
    expect(scraps()).toBe(0);
  });
});

describe('offer celebration, already an offer', () => {
  it('doesn’t celebrate an application that was already an offer', async () => {
    setup('offer');
    await setDetailStatus('Interview');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Interview')); // prettier-ignore
    expect(overlay()).toBeNull();
  });
});

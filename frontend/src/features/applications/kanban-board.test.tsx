import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppProviders } from '@/app/providers';
import { createQueryClient } from '@/lib/query-client';

import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

import { boardQuery } from './api';
import { KanbanBoard } from './kanban-board';

/*
 * What jsdom can drive: structure, keyboard pick-up/drop/cancel (no layout needed), the
 * "Move to…" menu, failures. Real pointer/touch/arrow-key movement needs layout and is
 * covered by the Phase 11 Playwright flow (see README). The drop maths is unit-tested in
 * board-dnd.test.ts.
 */

const MONZO = 'Monzo, Senior Frontend Engineer';

let backend: ReturnType<typeof mockApplicationsBackend>;
beforeEach(() => {
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend();
});

async function openBoard() {
  const app = renderApp('/applications');
  await findPageHeading('Applications');
  await screen.findByRole('region', { name: 'Pipeline board' });
  return app;
}
/** The board alone, reading the live board query, with a collision detector that reports
 * nothing (what a pick-up-and-drop-in-place really gives; jsdom's zero-size layout would
 * otherwise put every drag "over" the first column). */
function BoardOnly() {
  const board = useQuery(boardQuery());
  return board.data ? (
    <KanbanBoard board={board.data} onAdd={() => undefined} collisionDetection={() => []} />
  ) : null;
}
async function openBoardOnly() {
  render(
    <AppProviders queryClient={createQueryClient()}>
      <MemoryRouter>
        <BoardOnly />
      </MemoryRouter>
    </AppProviders>,
  );
  await screen.findByRole('region', { name: 'Pipeline board' });
}
const column = (name: string) => screen.getByRole('region', { name });
const cardsIn = (name: string) =>
  within(column(name))
    .queryAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);
const moves = () => backend.calls.filter((c) => c === 'POST /move').length;
const liveText = () =>
  [...document.querySelectorAll('[aria-live]')].map((n) => n.textContent).join(' | ');

describe('Kanban board', () => {
  it('shows a labelled column per status with counts, and cards linking to their page', async () => {
    await openBoard();

    expect(cardsIn('Applied')).toEqual(['Monzo', 'Wise']);
    expect(within(column('Applied')).getByText('2')).toBeInTheDocument();
    expect(cardsIn('Offer')).toEqual([]);
    const monzo = backend.applications.find((a) => a.company === 'Monzo');
    expect(screen.getByRole('link', { name: MONZO })).toHaveAttribute(
      'href',
      `/applications/${monzo?.id}`,
    );
    expect(screen.getByRole('button', { name: `Move ${MONZO}` })).toHaveAttribute(
      'aria-roledescription',
      'draggable card',
    );
  });

  it('opens the application from its card', async () => {
    const user = userEvent.setup();
    await openBoard();

    await user.click(screen.getByRole('link', { name: MONZO }));
    await findPageHeading('Monzo');
  });

  it('cancels a keyboard drag with Escape: card stays, no request, announced', async () => {
    const user = userEvent.setup();
    await openBoardOnly();

    screen.getByRole('button', { name: `Move ${MONZO}` }).focus();
    await user.keyboard(' ');
    await waitFor(() =>
      expect(liveText()).toContain(`Picked up ${MONZO}. Applied, position 1 of 2.`),
    );
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(liveText()).toContain(`Move cancelled. ${MONZO} is back in Applied, position 1.`),
    );
    expect(cardsIn('Applied')).toEqual(['Monzo', 'Wise']);
    expect(moves()).toBe(0);
  });

  it('dropping a card where it started makes no request', async () => {
    const user = userEvent.setup();
    await openBoardOnly();

    screen.getByRole('button', { name: `Move ${MONZO}` }).focus();
    await user.keyboard(' ');
    await user.keyboard(' ');

    await waitFor(() =>
      expect(liveText()).toContain(`Moved ${MONZO} to Applied, position 1 of 2.`),
    );
    expect(moves()).toBe(0);
  });

  it('“Move to…” moves the card to the end of a column, announces it and keeps focus on it', async () => {
    const user = userEvent.setup();
    await openBoard();

    await user.click(screen.getByRole('button', { name: `Move ${MONZO} to…` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Interview' }));

    await waitFor(() => expect(cardsIn('Interview')).toEqual(['Deliveroo', 'Monzo']));
    expect(cardsIn('Applied')).toEqual(['Wise']);
    expect(liveText()).toContain(`Moved ${MONZO} to Interview, position 2 of 2.`);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: `Move ${MONZO}` })).toHaveFocus(),
    );
    await waitFor(() =>
      expect(backend.applications.find((a) => a.company === 'Monzo')).toMatchObject({
        status: 'interview',
        position: 2048, // after Deliveroo (1024): appended
      }),
    );
  });

  it('“Move to…” an empty column places the card first', async () => {
    const user = userEvent.setup();
    await openBoard();

    await user.click(screen.getByRole('button', { name: `Move ${MONZO} to…` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Offer' }));

    await waitFor(() => expect(cardsIn('Offer')).toEqual(['Monzo']));
    await waitFor(() =>
      expect(backend.applications.find((a) => a.company === 'Monzo')?.position).toBe(1024),
    );
  });

  it('a failed move puts the card back and explains it in a toast', async () => {
    const monzo = backend.applications.find((a) => a.company === 'Monzo');
    server.use(
      http.post(`/api/v1/applications/${monzo?.id}/move`, () =>
        HttpResponse.json({ detail: 'Database unavailable' }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    await openBoard();

    await user.click(screen.getByRole('button', { name: `Move ${MONZO} to…` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Offer' }));

    expect(await screen.findByText(`Couldn’t move ${MONZO}`)).toBeVisible();
    expect(screen.getByText(/It’s back in Applied\. Database unavailable/)).toBeVisible();
    await waitFor(() => expect(cardsIn('Applied')).toEqual(['Monzo', 'Wise']));
    expect(cardsIn('Offer')).toEqual([]);
  });

  it('adds to a column from its + button, with that status preselected', async () => {
    const user = userEvent.setup();
    await openBoard();

    await user.click(screen.getByRole('button', { name: 'Add to Interview' }));
    const panel = await screen.findByRole('dialog', { name: 'Add an application' });
    expect(within(panel).getByLabelText('Status')).toHaveTextContent('Interview');
  });
});

describe('board states', () => {
  it('invites you to add the first application when there are none', async () => {
    mockApplicationsBackend({ applications: [] });
    renderApp('/applications');
    await findPageHeading('Applications');
    expect(await screen.findByText('No applications yet')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add your first application' })).toBeVisible();
  });

  it('offers a retry when the board fails to load', async () => {
    server.use(
      http.get('/api/v1/applications/board', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );
    renderApp('/applications');
    expect(await screen.findByText('Your board didn’t load')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

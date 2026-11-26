import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { createQueryClient } from '@/lib/query-client';

import { addDays } from 'date-fns/addDays';

import { formatDateOnly, toDateOnly } from '@/lib/dates';
import { makeApplication, mockApplicationsBackend } from '@/test/fake-applications';
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
  const view = render(
    <AppProviders queryClient={createQueryClient()}>
      <MemoryRouter>
        <BoardOnly />
      </MemoryRouter>
    </AppProviders>,
  );
  await screen.findByRole('region', { name: 'Pipeline board' });
  return view;
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

  it('renders the drag preview in <body>, outside the page', async () => {
    // The preview is position: fixed; inside the page, the entrance transition's transform
    // would offset it and dnd-kit would detect the wrong column (seen in Playwright).
    const user = userEvent.setup();
    const { container } = await openBoardOnly();

    screen.getByRole('button', { name: `Move ${MONZO}` }).focus();
    await user.keyboard(' ');
    await waitFor(() => expect(liveText()).toContain(`Picked up ${MONZO}.`));

    const monzo = [...document.querySelectorAll('h3')].filter((h) => h.textContent === 'Monzo');
    expect(monzo).toHaveLength(2); // the card's slot and the preview
    expect(monzo.filter((h) => !container.contains(h))).toHaveLength(1);
    await user.keyboard('{Escape}');
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

    await user.click(screen.getByRole('button', { name: `Move to… ${MONZO}` }));
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

    await user.click(screen.getByRole('button', { name: `Move to… ${MONZO}` }));
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

    await user.click(screen.getByRole('button', { name: `Move to… ${MONZO}` }));
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

describe('apply-by line', () => {
  it('shows the apply-by date on wishlist cards, flagged within a week; applied cards show when', async () => {
    const inDays = (n: number) => toDateOnly(addDays(new Date(), n));
    mockApplicationsBackend({
      applications: [
        makeApplication({
          company: 'Figma',
          status: 'wishlist',
          applied_on: null,
          deadline_on: inDays(2),
        }),
        makeApplication({ company: 'Monzo', status: 'applied', deadline_on: inDays(2) }),
      ],
    });
    await openBoard();

    const due = formatDateOnly(inDays(2), 'EEE d MMM');
    expect(within(column('Wishlist')).getByText(`Apply by ${due} · in 2 days`)).toHaveClass(
      'font-semibold',
    );
    expect(within(column('Applied')).queryByText(/Apply by/)).not.toBeInTheDocument();
    expect(within(column('Applied')).getByText(/^Applied \d{1,2} \w{3}$/)).toBeVisible();
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
    await findPageHeading('Applications'); // the page fades in; visibility lands after it
    expect(await screen.findByText('Your board didn’t load')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

describe('column chips (phones)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows each column with its count and jumps the board to the one chosen', async () => {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    const user = userEvent.setup();
    await openBoard(); // jsdom answers every media query false: the phone layout

    const chips = screen.getByRole('navigation', { name: 'Columns' });
    const interview = within(chips).getByRole('button', { name: /^Interview \d+ applications?$/ });
    expect(within(chips).getByRole('button', { name: /^Wishlist / })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await user.click(interview);
    expect(interview).toHaveAttribute('aria-current', 'true');
    expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ inline: 'start' }));
    expect(scrolled.mock.contexts.at(-1)).toBe(column('Interview'));
    expect(screen.getByText(/Swipe for the next column/)).toBeVisible();
  });

  it('are left out on wider screens, which see every column and the keyboard hint', async () => {
    const real = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      ...real(query),
      matches: query === '(min-width: 40rem)',
    }));
    await openBoard();

    expect(screen.queryByRole('navigation', { name: 'Columns' })).not.toBeInTheDocument();
    expect(screen.getByText(/Keyboard: focus a card’s handle/)).toBeVisible();
  });
});

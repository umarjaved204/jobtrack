import type { ClientRect, UniqueIdentifier } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeApplication } from '@/test/fake-applications';
import { type ApplicationStatus, applicationStatuses } from '@/types/application';

import { BoardCardPreview } from './board-card';

/*
 * Keyboard moves between columns come from dnd-kit's `sortableKeyboardCoordinates`: on
 * ArrowRight it keeps the droppables whose left edge is right of the dragged rect's, then
 * takes the closest. The dragged rect is the DragOverlay's, measured from the overlay's
 * first child *with transforms*. jsdom has no layout, so these tests hand the getter the
 * board's real geometry (measured in Chromium at 1440 px) and check the contract the board
 * relies on; the Playwright pipeline flow checks the same press in a real browser.
 */

type Context = Parameters<typeof sortableKeyboardCoordinates>[1]['context'];

const COLUMN_TOP = 510;
const COLUMN_HEIGHT = 420;
const CARD = { top: 520, width: 232, height: 131 };
// Column lefts and widths as rendered: Rejected and Withdrawn are the narrower exits.
const COLUMN_LEFT: Record<ApplicationStatus, number> = {
  wishlist: 156,
  applied: 412,
  screening: 668,
  interview: 924,
  offer: 1180,
  rejected: 1436,
  withdrawn: 1660,
};
const columnWidth = (s: ApplicationStatus) => (s === 'rejected' || s === 'withdrawn' ? 200 : 232);

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** The bounding box of `r` rotated by `degrees` about its centre (what CSS rotate measures). */
function tilted(r: ClientRect, degrees: number): ClientRect {
  const a = (Math.abs(degrees) * Math.PI) / 180;
  const width = r.width * Math.cos(a) + r.height * Math.sin(a);
  const height = r.width * Math.sin(a) + r.height * Math.cos(a);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return rect(cx - width / 2, cy - height / 2, width, height);
}

const cardId = (s: ApplicationStatus) => `card-${s}`;
const cardRect = (s: ApplicationStatus) => rect(COLUMN_LEFT[s], CARD.top, CARD.width, CARD.height);

/** Seven columns, one card in each, as dnd-kit's sensor context sees them mid-drag. */
function boardContext(activeStatus: ApplicationStatus, collisionRect: ClientRect): Context {
  const rects = new Map<UniqueIdentifier, ClientRect>();
  const containers = new Map<UniqueIdentifier, object>();
  for (const status of applicationStatuses) {
    const columnRect = rect(COLUMN_LEFT[status], COLUMN_TOP, columnWidth(status), COLUMN_HEIGHT);
    rects.set(status, columnRect);
    containers.set(status, {
      id: status,
      disabled: false,
      node: { current: document.createElement('ol') },
      data: { current: {} },
    });
    rects.set(cardId(status), cardRect(status));
    containers.set(cardId(status), {
      id: cardId(status),
      disabled: false,
      node: { current: document.createElement('article') },
      data: { current: { sortable: { containerId: status, items: [cardId(status)], index: 0 } } },
    });
  }
  const droppableContainers = Object.assign(containers, {
    getEnabled: () => [...containers.values()],
  });
  return {
    active: { id: cardId(activeStatus) },
    collisionRect,
    droppableRects: rects,
    droppableContainers,
    over: { id: cardId(activeStatus) },
    scrollableAncestors: [],
  } as unknown as Context;
}

function press(
  code: 'ArrowRight' | 'ArrowLeft',
  from: ApplicationStatus,
  collisionRect: ClientRect,
) {
  return sortableKeyboardCoordinates(new KeyboardEvent('keydown', { code }), {
    active: cardId(from),
    currentCoordinates: { x: collisionRect.left, y: collisionRect.top },
    context: boardContext(from, collisionRect),
  });
}

const columnAt = (x: number | undefined) =>
  applicationStatuses.find((s) => COLUMN_LEFT[s] === x) ?? `no column at x=${x}`;

describe('keyboard moves between board columns', () => {
  it.each(applicationStatuses.slice(0, -1).map((s, i) => [s, applicationStatuses[i + 1]]))(
    'the first ArrowRight from %s targets %s',
    (from, to) => {
      expect(columnAt(press('ArrowRight', from, cardRect(from))?.x)).toBe(to);
    },
  );

  it.each(applicationStatuses.slice(1).map((s, i) => [s, applicationStatuses[i]]))(
    'the first ArrowLeft from %s targets %s',
    (from, to) => {
      expect(columnAt(press('ArrowLeft', from, cardRect(from))?.x)).toBe(to);
    },
  );

  it('a tilted drag rect makes ArrowRight target the card’s own column (the old bug)', () => {
    // The preview's 2° tilt widened the measured rect a few px to the left (153.3 for 156 in
    // Chromium), so the card's own column counted as "to the right" of it.
    const rect = tilted(cardRect('wishlist'), 2);
    expect(rect.left).toBeLessThan(COLUMN_LEFT.wishlist - 2);
    expect(columnAt(press('ArrowRight', 'wishlist', rect)?.x)).toBe('wishlist');
  });
});

describe('BoardCardPreview', () => {
  it('keeps transforms off the box dnd-kit measures (the overlay’s first child)', () => {
    const overlay = document.createElement('div');
    render(<BoardCardPreview application={makeApplication({ company: 'Figma' })} />, {
      container: document.body.appendChild(overlay),
    });

    expect(overlay.children).toHaveLength(1);
    const measured = overlay.firstElementChild as HTMLElement;
    expect(measured.className).not.toMatch(/rotate|scale|skew|translate/);
    expect(measured.style.transform).toBe('');
    // The tilt is still there, one level in.
    expect(measured.querySelector('[class*="rotate"]')).not.toBeNull();
  });
});

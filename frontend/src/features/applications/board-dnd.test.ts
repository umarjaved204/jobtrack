import { describe, expect, it } from 'vitest';

import { makeApplication } from '@/test/fake-applications';
import type { ApplicationStatus } from '@/types/application';

import { POSITION_STEP, positionBetween } from './board';
import {
  announce,
  type Columns,
  columnOf,
  finalizeDrop,
  moveForDrop,
  moveToEnd,
  placement,
  projectOver,
} from './board-dnd';

const card = (id: string, status: ApplicationStatus, position: number) =>
  makeApplication({ id, status, position, company: id[0]?.toUpperCase() + id.slice(1) });

function columns(): Columns {
  return {
    wishlist: [],
    applied: [card('monzo', 'applied', 1024), card('wise', 'applied', 2048), card('revolut', 'applied', 3072)],
    screening: [], // empty column
    interview: [card('figma', 'interview', 1024)],
    offer: [],
    rejected: [],
    withdrawn: [],
  }; // prettier-ignore
}
const ids = (cols: Columns, status: ApplicationStatus) => cols[status].map((a) => a.id);

describe('midpoint positions (positionBetween)', () => {
  it('first card in a column: one step before the current first', () => {
    expect(positionBetween(undefined, { position: 1024 })).toBe(1024 - POSITION_STEP);
  });
  it('last card: one step after the current last', () => {
    expect(positionBetween({ position: 3072 }, undefined)).toBe(3072 + POSITION_STEP);
  });
  it('only card / empty column: the first step', () => {
    expect(positionBetween()).toBe(POSITION_STEP);
  });
  it('between two cards: their midpoint', () => {
    expect(positionBetween({ position: 1024 }, { position: 2048 })).toBe(1536);
  });
});

describe('projectOver (dragging across columns)', () => {
  it('drops into an empty column at its only position', () => {
    const next = projectOver(columns(), 'wise', 'screening');
    expect(ids(next, 'applied')).toEqual(['monzo', 'revolut']);
    expect(ids(next, 'screening')).toEqual(['wise']);
    expect(next.screening[0]?.status).toBe('screening');
  });

  it('inserts before the card it is over in another column', () => {
    const next = projectOver(columns(), 'wise', 'figma');
    expect(ids(next, 'interview')).toEqual(['wise', 'figma']);
  });

  it('leaves same-column drags alone (reorder happens on drop)', () => {
    const cols = columns();
    expect(projectOver(cols, 'monzo', 'revolut')).toBe(cols);
  });
});

describe('finalizeDrop + moveForDrop', () => {
  it('same spot: no move (no request)', () => {
    const start = columns();
    const end = finalizeDrop(start, 'wise', 'wise');
    expect(moveForDrop(start, end, 'wise')).toBeNull();
  });

  it('dropped over nothing: no move', () => {
    const start = columns();
    expect(moveForDrop(start, finalizeDrop(start, 'wise', null), 'wise')).toBeNull();
  });

  it('into an empty column: status changes, first position', () => {
    const start = columns();
    const end = finalizeDrop(projectOver(start, 'monzo', 'screening'), 'monzo', 'screening');
    expect(moveForDrop(start, end, 'monzo')).toEqual({
      id: 'monzo',
      status: 'screening',
      position: POSITION_STEP,
    });
  });

  it('to the top of a column: before the first card', () => {
    const start = columns();
    const end = finalizeDrop(start, 'revolut', 'monzo');
    expect(ids(end, 'applied')).toEqual(['revolut', 'monzo', 'wise']);
    expect(moveForDrop(start, end, 'revolut')).toEqual({
      id: 'revolut',
      status: 'applied',
      position: 1024 - POSITION_STEP,
    });
  });

  it('to the bottom of a column: after the last card', () => {
    const start = columns();
    const end = finalizeDrop(start, 'monzo', 'revolut');
    expect(ids(end, 'applied')).toEqual(['wise', 'revolut', 'monzo']);
    expect(moveForDrop(start, end, 'monzo')?.position).toBe(3072 + POSITION_STEP);
  });

  it('between two cards in another column: their midpoint', () => {
    const start = columns();
    const withSecond: Columns = {
      ...start,
      interview: [...start.interview, card('linear', 'interview', 2048)],
    };
    // Crossing over Linear puts Wise in front of it; the drop then lands on its own slot.
    const end = finalizeDrop(projectOver(withSecond, 'wise', 'linear'), 'wise', 'wise');
    expect(ids(end, 'interview')).toEqual(['figma', 'wise', 'linear']);
    expect(moveForDrop(withSecond, end, 'wise')).toEqual({
      id: 'wise',
      status: 'interview',
      position: 1536,
    });
  });

  it('dropped over a card in its new column: takes that card’s slot, as the preview shows', () => {
    const start = columns();
    const withSecond: Columns = {
      ...start,
      interview: [...start.interview, card('linear', 'interview', 2048)],
    };
    const end = finalizeDrop(projectOver(withSecond, 'wise', 'linear'), 'wise', 'linear');
    expect(ids(end, 'interview')).toEqual(['figma', 'linear', 'wise']);
    expect(moveForDrop(withSecond, end, 'wise')?.position).toBe(2048 + POSITION_STEP);
  });
});

describe('moveToEnd ("Move to…" menu)', () => {
  it('appends after the last card of the target column', () => {
    expect(moveToEnd(columns(), 'monzo', 'interview')).toEqual({
      id: 'monzo',
      status: 'interview',
      position: 1024 + POSITION_STEP,
    });
  });
  it('starts an empty column at the first step', () => {
    expect(moveToEnd(columns(), 'monzo', 'offer').position).toBe(POSITION_STEP);
  });
});

describe('announcements', () => {
  const cols = columns();
  const wise = cols.applied[1];

  it('describe card, column and position', () => {
    if (!wise) throw new Error('fixture');
    const p = placement(cols, 'wise');
    if (!p) throw new Error('fixture');
    expect(announce.pickUp(wise, p)).toBe(
      'Picked up Wise, Senior Frontend Engineer. Applied, position 2 of 3.',
    );
    expect(announce.over({ status: 'screening', index: 1, total: 1 })).toBe(
      'Over Screening, position 1 of 1.',
    );
    expect(announce.drop(wise, { status: 'interview', index: 2, total: 2 })).toBe(
      'Moved Wise, Senior Frontend Engineer to Interview, position 2 of 2.',
    );
    expect(announce.cancel(wise, p)).toBe(
      'Move cancelled. Wise, Senior Frontend Engineer is back in Applied, position 2.',
    );
  });

  it('columnOf resolves both card ids and column ids', () => {
    expect(columnOf(cols, 'figma')).toBe('interview');
    expect(columnOf(cols, 'screening')).toBe('screening');
    expect(columnOf(cols, 'nope')).toBeUndefined();
  });
});

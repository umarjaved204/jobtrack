import { describe, expect, it } from 'vitest';

import { makeApplication } from '@/test/fake-applications';
import type { Board } from '@/types/application';

import { moveInBoard, POSITION_STEP, positionBetween } from './board';

describe('positionBetween', () => {
  it('uses the midpoint between neighbours', () => {
    expect(positionBetween({ position: 1024 }, { position: 2048 })).toBe(1536);
    expect(positionBetween({ position: 1024 }, { position: 1025 })).toBe(1024.5);
  });

  it('steps past the ends of a column', () => {
    expect(positionBetween({ position: 3072 }, undefined)).toBe(3072 + POSITION_STEP);
    expect(positionBetween(undefined, { position: 1024 })).toBe(0);
    expect(positionBetween(undefined, { position: 0 })).toBe(-POSITION_STEP); // floats: fine
  });

  it('starts an empty column at one step', () => {
    expect(positionBetween()).toBe(POSITION_STEP);
  });
});

describe('moveInBoard', () => {
  const monzo = makeApplication({ id: 'monzo', status: 'applied', position: 1024 });
  const wise = makeApplication({ id: 'wise', status: 'applied', position: 2048 });
  const octopus = makeApplication({ id: 'octopus', status: 'screening', position: 1024 });
  const board: Board = {
    columns: [
      { status: 'applied', applications: [monzo, wise] },
      { status: 'screening', applications: [octopus] },
      { status: 'offer', applications: [] },
    ],
  };
  const ids = (b: Board) => b.columns.map((c) => c.applications.map((a) => a.id));

  it('moves a card to another column, in position order', () => {
    const next = moveInBoard(board, { id: 'monzo', status: 'screening', position: 512 });
    expect(ids(next)).toEqual([['wise'], ['monzo', 'octopus'], []]);
    expect(next.columns[1]?.applications[0]).toMatchObject({ status: 'screening', position: 512 });
  });

  it('reorders within a column', () => {
    const next = moveInBoard(board, { id: 'monzo', status: 'applied', position: 3072 });
    expect(ids(next)).toEqual([['wise', 'monzo'], ['octopus'], []]);
  });

  it('never mutates the input and keeps untouched columns as-is', () => {
    const snapshot = structuredClone(board);
    const next = moveInBoard(board, { id: 'monzo', status: 'screening', position: 512 });
    expect(board).toEqual(snapshot);
    expect(next.columns[2]).toBe(board.columns[2]); // same object: no needless re-render
  });

  it('ignores unknown ids', () => {
    expect(moveInBoard(board, { id: 'nope', status: 'offer', position: 1 })).toBe(board);
  });
});

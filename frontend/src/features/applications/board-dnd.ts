import { arrayMove } from '@dnd-kit/sortable';

import {
  type Application,
  type ApplicationStatus,
  applicationStatuses,
  type Board,
  statusLabels,
} from '@/types/application';

import { type MoveInput, positionBetween } from './board';

/*
 * Pure drag-and-drop logic for the Kanban board, kept out of the components so it can be
 * unit-tested (jsdom has no layout, so real drags can't run there).
 *
 * Droppable ids: each column's id is its status; each card's id is its application id.
 */

export type Columns = Record<ApplicationStatus, Application[]>;

export function columnsFromBoard(board: Board): Columns {
  const columns = Object.fromEntries(applicationStatuses.map((s) => [s, []])) as unknown as Columns;
  for (const column of board.columns) columns[column.status] = column.applications;
  return columns;
}

const isStatus = (id: string): id is ApplicationStatus =>
  (applicationStatuses as readonly string[]).includes(id);

/** The column holding `id`: a column id is its own column; a card id is looked up. */
export function columnOf(columns: Columns, id: string): ApplicationStatus | undefined {
  if (isStatus(id)) return id;
  return applicationStatuses.find((s) => columns[s].some((a) => a.id === id));
}

/**
 * While dragging over another column, show the card there: before the card it's over, or
 * at the end when over the column itself (e.g. an empty column). Same column: unchanged
 * (reordering within a column is applied on drop).
 */
export function projectOver(columns: Columns, activeId: string, overId: string): Columns {
  const from = columnOf(columns, activeId);
  const to = columnOf(columns, overId);
  if (!from || !to || from === to) return columns;
  const card = columns[from].find((a) => a.id === activeId);
  if (!card) return columns;

  const target = columns[to];
  const overIndex = target.findIndex((a) => a.id === overId);
  const index = overIndex >= 0 ? overIndex : target.length;
  return {
    ...columns,
    [from]: columns[from].filter((a) => a.id !== activeId),
    [to]: [...target.slice(0, index), { ...card, status: to }, ...target.slice(index)],
  };
}

/** The final columns on drop: cross-column moves were applied on drag-over; this adds the
 * reorder when the card is dropped over another card in its (current) column. */
export function finalizeDrop(columns: Columns, activeId: string, overId: string | null): Columns {
  const projected = overId ? projectOver(columns, activeId, overId) : columns;
  const status = columnOf(projected, activeId);
  if (!status || !overId) return projected;
  const list = projected[status];
  const from = list.findIndex((a) => a.id === activeId);
  const to = list.findIndex((a) => a.id === overId);
  if (to < 0 || from === to) return projected;
  return { ...projected, [status]: arrayMove(list, from, to) };
}

export type Placement = { status: ApplicationStatus; index: number; total: number };

/** 1-based position of a card in its column, for announcements. */
export function placement(columns: Columns, id: string): Placement | null {
  const status = columnOf(columns, id);
  if (!status) return null;
  const list = columns[status];
  return { status, index: list.findIndex((a) => a.id === id) + 1, total: list.length };
}

/**
 * The move to send after a drop, or null when the card ends where it started (no request).
 * The position is the midpoint between its new neighbours (backend re-spaces if crowded).
 */
export function moveForDrop(start: Columns, end: Columns, id: string): MoveInput | null {
  const before = placement(start, id);
  const after = placement(end, id);
  if (!before || !after) return null;
  if (before.status === after.status && before.index === after.index) return null;

  const list = end[after.status];
  const i = after.index - 1;
  return { id, status: after.status, position: positionBetween(list[i - 1], list[i + 1]) };
}

/** "Move to…" menu: append to the end of the target column. */
export function moveToEnd(columns: Columns, id: string, status: ApplicationStatus): MoveInput {
  const others = columns[status].filter((a) => a.id !== id);
  return { id, status, position: positionBetween(others.at(-1), undefined) };
}

// ---------------------------------------------------------------- announcements

export const cardName = (a: Pick<Application, 'company' | 'role_title'>) =>
  `${a.company}, ${a.role_title}`;

const where = (p: Placement) => `${statusLabels[p.status]}, position ${p.index} of ${p.total}`;

export const announce = {
  pickUp: (a: Application, p: Placement) => `Picked up ${cardName(a)}. ${where(p)}.`,
  over: (p: Placement) => `Over ${where(p)}.`,
  drop: (a: Application, p: Placement) =>
    `Moved ${cardName(a)} to ${statusLabels[p.status]}, position ${p.index} of ${p.total}.`,
  cancel: (a: Application, p: Placement) =>
    `Move cancelled. ${cardName(a)} is back in ${statusLabels[p.status]}, position ${p.index}.`,
};

export const SCREEN_READER_INSTRUCTIONS =
  'To pick up a card, press Space or Enter. Use the arrow keys to move it between columns ' +
  'and within a column. Press Space or Enter again to drop it, or Escape to cancel. ' +
  'You can also use the card’s “Move to” menu.';

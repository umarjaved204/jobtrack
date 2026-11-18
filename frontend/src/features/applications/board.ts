import type { ApplicationStatus } from '@/types/application';
import type { Board } from '@/types/application';

/** Matches the backend's POSITION_STEP: new cards and column ends are this far apart. */
export const POSITION_STEP = 1024;

type Positioned = { position: number };

/**
 * Position for a card dropped between `before` and `after` (either may be missing at a
 * column end). The backend stores it as-is and re-spaces a column once neighbours get
 * closer than 1e-6, so plain midpoints are fine.
 */
export function positionBetween(before?: Positioned, after?: Positioned): number {
  if (before && after) return (before.position + after.position) / 2;
  if (before) return before.position + POSITION_STEP;
  if (after) return after.position - POSITION_STEP;
  return POSITION_STEP;
}

export type MoveInput = { id: string; status: ApplicationStatus; position: number };

/**
 * The board after moving one card: removed from its column, given the new status and
 * position, and inserted in order. Returns a new object (cache data is immutable);
 * unknown ids leave the board unchanged.
 */
export function moveInBoard(board: Board, { id, status, position }: MoveInput): Board {
  const card = board.columns.flatMap((c) => c.applications).find((a) => a.id === id);
  if (!card) return board;
  const moved = { ...card, status, position };

  return {
    columns: board.columns.map((column) => {
      const others = column.applications.filter((a) => a.id !== id);
      if (column.status !== status) {
        return others.length === column.applications.length
          ? column
          : { ...column, applications: others };
      }
      const applications = [...others, moved].sort((a, b) => a.position - b.position);
      return { ...column, applications };
    }),
  };
}

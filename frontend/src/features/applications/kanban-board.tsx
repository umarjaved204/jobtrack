import {
  type Announcements,
  closestCorners,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useReducedMotion } from 'motion/react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { LiveRegion } from '@/components/live-region';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isApiError } from '@/lib/api/errors';
import {
  type Application,
  type ApplicationStatus,
  applicationStatuses,
  type Board,
  statusLabels,
} from '@/types/application';

import { useMoveApplication } from './api';
import type { MoveInput } from './board';
import { BoardCard, BoardCardPreview } from './board-card';
import { BoardColumn } from './board-column';
import { BoardColumnNav } from './board-column-nav';
import {
  announce,
  cardName,
  type Columns,
  columnsFromBoard,
  finalizeDrop,
  moveForDrop,
  moveToEnd,
  placement,
  projectOver,
  SCREEN_READER_INSTRUCTIONS,
} from './board-dnd';

/** A click right after a drag ends belongs to the drag, not to the card's link. */
const CLICK_AFTER_DRAG_MS = 250;

type Drag = { activeId: string; start: Columns; columns: Columns };

/**
 * The pipeline board. Cards move by drag (pointer, touch hold, keyboard handle) or by
 * each card's "Move to…" menu; both go through the optimistic `useMoveApplication`.
 *
 * During a drag the board renders from local state (cards follow the pointer across
 * columns); on drop it computes the new position from the neighbours and fires one
 * move, or none if the card ended where it started. Escape restores it, no request.
 */
function KanbanBoard({
  board,
  onAdd,
  collisionDetection = closestCorners,
}: {
  board: Board;
  onAdd: (status: ApplicationStatus) => void;
  /** Tests only: jsdom has no layout, so closestCorners would see every column at once. */
  collisionDetection?: CollisionDetection;
}) {
  const move = useMoveApplication();
  const reduceMotion = useReducedMotion();
  const base = useMemo(() => columnsFromBoard(board), [board]);
  const [drag, setDrag] = useState<Drag | null>(null);
  // After a drop, keep showing the dropped order until the cache has the optimistic update
  // (the mutation applies it asynchronously); tied to the board it was computed from.
  const [settling, setSettling] = useState<{ board: Board; columns: Columns } | null>(null);
  const columns = drag?.columns ?? (settling?.board === board ? settling.columns : base);

  // Latest state for dnd-kit's callbacks (announcements run inside its event handling).
  const latest = useRef({ columns, drag });
  useLayoutEffect(() => {
    latest.current = { columns, drag };
  });
  const lastDragEnd = useRef(0);
  const justDragged = useCallback(() => Date.now() - lastDragEnd.current < CLICK_AFTER_DRAG_MS, []);

  const [message, setMessage] = useState<{ id: number; text: string } | null>(null);
  // Focus the moved card's handle once it renders *in its new column* (the old card is
  // still mounted until the optimistic update lands, and then unmounts).
  const [focusAfterMove, setFocusAfterMove] = useState<{
    id: string;
    status: ApplicationStatus;
  } | null>(null);
  const clearFocusRequest = useCallback(() => setFocusAfterMove(null), []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Touch: press and hold, so a swipe scrolls the board instead of dragging a card.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findApplication = (id: string) =>
    applicationStatuses.flatMap((s) => latest.current.columns[s]).find((a) => a.id === id);

  function commit(input: MoveInput, application: Application, from: ApplicationStatus) {
    move.mutate(input, {
      onError: (error) =>
        toast.error(`Couldn’t move ${cardName(application)}`, {
          description: `It’s back in ${statusLabels[from]}. ${
            isApiError(error) ? error.detail : 'Please try again.'
          }`,
        }),
    });
  }

  const onDragStart = ({ active }: DragStartEvent) =>
    setDrag({ activeId: String(active.id), start: base, columns: base });

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDrag(
      (d) => d && { ...d, columns: projectOver(d.columns, String(active.id), String(over.id)) },
    );
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEnd.current = Date.now();
    const current = latest.current.drag;
    setDrag(null);
    if (!current) return;
    const id = String(active.id);
    const end = finalizeDrop(current.columns, id, over ? String(over.id) : null);
    const input = moveForDrop(current.start, end, id);
    const application = current.start[placement(current.start, id)?.status ?? 'wishlist'].find(
      (a) => a.id === id,
    );
    if (!input || !application) return; // dropped where it started: nothing to save
    setSettling({ board, columns: end });
    commit(input, application, application.status);
  };

  const onDragCancel = () => {
    lastDragEnd.current = Date.now();
    setDrag(null); // back to the cached board: no request
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const app = findApplication(String(active.id));
      const p = placement(latest.current.columns, String(active.id));
      return app && p ? announce.pickUp(app, p) : undefined;
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === active.id) return undefined;
      // Runs before onDragOver updates state: project the move to describe where it'll be.
      const projected = projectOver(latest.current.columns, String(active.id), String(over.id));
      const p = placement(projected, String(active.id));
      return p ? announce.over(p) : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const current = latest.current.drag;
      if (!current) return undefined;
      const id = String(active.id);
      const app = findApplication(id);
      const end = finalizeDrop(current.columns, id, over ? String(over.id) : null);
      const p = placement(end, id);
      return app && p ? announce.drop(app, p) : undefined;
    },
    onDragCancel: ({ active }) => {
      const current = latest.current.drag;
      const id = String(active.id);
      const app = findApplication(id);
      const p = current && placement(current.start, id);
      return app && p ? announce.cancel(app, p) : undefined;
    },
  };

  function moveWithMenu(application: Application, status: ApplicationStatus) {
    const input = moveToEnd(base, application.id, status);
    const total = base[status].length + 1;
    commit(input, application, application.status);
    // A new id each time, so an identical message is still announced again.
    const text = announce.drop(application, { status, index: total, total });
    setMessage((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
    setFocusAfterMove({ id: application.id, status });
  }

  const active = drag
    ? applicationStatuses.flatMap((s) => columns[s]).find((a) => a.id === drag.activeId)
    : undefined;
  const dropAt = drag ? placement(columns, drag.activeId) : null;

  // Phones show one column at a time: chips above the board jump between them.
  const wide = useMediaQuery('(min-width: 40rem)');
  const scroller = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState<ApplicationStatus>('wishlist');
  const columnElement = (status: ApplicationStatus) =>
    scroller.current?.querySelector<HTMLElement>(`[data-column="${status}"]`) ?? null;
  const onBoardScroll = () => {
    const board = scroller.current;
    if (!board || wide) return;
    // The column whose left edge is nearest the snap point (scroll-padding) is the one in view.
    const snap = board.scrollLeft + (parseFloat(getComputedStyle(board).scrollPaddingLeft) || 0);
    let nearest: ApplicationStatus = applicationStatuses[0];
    let distance = Infinity;
    for (const status of applicationStatuses) {
      const d = Math.abs((columnElement(status)?.offsetLeft ?? 0) - snap);
      if (d < distance) [nearest, distance] = [status, d];
    }
    setInView(nearest);
  };
  const jumpTo = (status: ApplicationStatus) => {
    setInView(status);
    columnElement(status)?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      inline: 'start',
      block: 'nearest',
    });
  };
  const counts = Object.fromEntries(
    applicationStatuses.map((s) => [s, columns[s].length]),
  ) as Record<ApplicationStatus, number>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
      }}
    >
      {wide ? (
        <p className="mb-4 text-[0.8125rem] text-muted-foreground">
          Keyboard: focus a card’s handle, press Space to pick it up, arrow keys to move, Space to
          drop, Esc to cancel. Or use its Move to… menu.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[0.8125rem] text-muted-foreground">
            Swipe for the next column. Press and hold a card to drag it, or use its Move to… menu.
          </p>
          <BoardColumnNav counts={counts} current={inView} onJump={jumpTo} />
        </>
      )}
      {/* `relative`: absolutely positioned descendants (sr-only text in far columns) must be
          clipped by this scroller, not stretch the page sideways on phones. */}
      <div
        ref={scroller}
        onScroll={onBoardScroll}
        role="region"
        aria-label="Pipeline board"
        className="relative -mx-5 flex snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain border-t-[3px] border-rule px-5 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0"
      >
        {applicationStatuses.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            applications={columns[status]}
            onAdd={() => onAdd(status)}
          >
            {columns[status].map((application) => (
              <li key={application.id}>
                <BoardCard
                  application={application}
                  onMoveTo={(to) => moveWithMenu(application, to)}
                  justDragged={justDragged}
                  focusHandle={
                    focusAfterMove?.id === application.id &&
                    focusAfterMove.status === application.status
                  }
                  onHandleFocused={clearFocusRequest}
                  dropLabel={
                    dropAt && drag?.activeId === application.id
                      ? `Drop here · position ${dropAt.index} of ${dropAt.total}`
                      : undefined
                  }
                />
              </li>
            ))}
          </BoardColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={reduceMotion ? null : undefined}>
        {active ? <BoardCardPreview application={active} /> : null}
      </DragOverlay>
      <LiveRegion message={message} />
    </DndContext>
  );
}

export { KanbanBoard };

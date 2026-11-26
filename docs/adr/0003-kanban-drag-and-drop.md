# ADR 0003: Kanban drag and drop with classic dnd-kit

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The Applications board (Phase 6) moves cards between seven status columns and reorders
them within a column. Requirements, agreed before any code:

- Pointer, touch and keyboard dragging. Screen-reader announcements name the card, the
  column and the position ("Picked up Monzo, Backend Engineer. Applied, position 2 of 5.").
- Keyboard dragging between columns, including into and through **empty** columns.
- Touch: press-and-hold to drag, so a swipe still scrolls the board on a phone.
- A non-drag alternative for every move (WCAG 2.5.7 Dragging Movements).
- No patching or working around library internals.

dnd-kit has two generations: the established `@dnd-kit/core` + `@dnd-kit/sortable`
("classic") and the newer `@dnd-kit/react` (built on `@dnd-kit/dom`). The newer package was
the first choice, with an automatic fallback to classic if a spike in a real browser
(Chrome, driven by Playwright) failed any requirement above.

## Spike results

`@dnd-kit/react` met most requirements after configuration (skipping the self-target
`dragover` that overwrote the pick-up announcement; normal collision priority for empty
columns; pointer activation on the whole card rather than only the handle). It failed one:

- **Keyboard drag through an empty column.** A card could land in an empty column, but the
  same drag could not continue past it. The keyboard plugin computes the next position from
  the sortable group before React re-renders the moved card, and fixing that needed changes
  inside the plugin. That met the fallback condition.

Classic dnd-kit passed every requirement in the same harness, with one caveat (below).

## Decision

- **Classic dnd-kit**: `DndContext` with `MouseSensor` (5 px activation distance),
  `TouchSensor` (250 ms hold, 5 px tolerance) and `KeyboardSensor`
  (`sortableKeyboardCoordinates`); `closestCorners` collision detection; one `SortableContext`
  per column and a `useDroppable` per column so empty columns accept drops.
- **Pure logic in `board-dnd.ts`**, unit-tested: projecting a card into another column while
  dragging, the final order on drop, the 1-based position used in announcements, and the
  move to send. Dropping where the card started sends nothing.
- **Positions** are floats; a drop sends the midpoint of the new neighbours
  (`POSITION_STEP` = 1024 for an empty column or an end). The server re-spaces a column whose
  neighbours get too close.
- **Optimistic moves** update the board query at once. A failed move rolls back only if it
  is the last move still pending (rolling back an earlier snapshot would undo later moves),
  shows a toast, and the board refetches once after the last move settles.
- **Accessible alternatives**: each card is a link to its detail page, has a labelled drag
  handle for keyboard dragging, and a "Move to…" menu that appends the card to the end of
  any column through the same mutation.
- **Announcements** are computed from projected state, because dnd-kit calls the
  announcement callbacks before the `onDragOver` state update renders.
- **Reduced motion**: no drop animation and no sortable transitions.

## Consequences

- Keyboard dragging moves one column per arrow press, from every column and in both
  directions (see "Revision 1"). The spike's note about skipping columns at speed didn't
  reproduce in Phase 11 (three presses 30 to 300 ms apart always ended in the same column).
  The "Move to…" menu stays the non-drag path.
- jsdom has no layout, so real drag paths (pointer, touch, arrow-key movement, auto-scroll,
  drop animation) need Playwright (Phase 11). Component tests inject a collision detector
  that reports nothing, which models a pick-up and drop in place.
- Spring-physics drag feedback is deferred to the Phase 10 polish pass.
- Revisit `@dnd-kit/react` when its keyboard sensor handles moves between groups across
  re-renders; the pure logic in `board-dnd.ts` doesn't depend on either package beyond
  `arrayMove`.

## Revision 1 (2026-11-26): the first arrow press after pick-up

**Symptom.** From Wishlist, Applied or Screening, the first ArrowRight after picking a card
up left it in its own column (announced as "Over Wishlist"); every later press moved one
column. From Interview onward the first press worked.

**Cause.** Not the collision detection strategy: `closestCorners` was fine, and swapping it
would not have helped. dnd-kit measures the `DragOverlay` through its first child
(`getMeasurableNode`) *with* transforms, and our preview put its 2° tilt on that child. The
tilted card's bounding box starts ~2.7 px left of the real card (153.3 for 156 in Chromium).
`sortableKeyboardCoordinates` keeps, for ArrowRight, the droppables whose left edge is right
of the dragged rect's, so the card's own column qualified and won; that "move" snapped the
rect to the column's exact edge, which is why later presses worked. Columns past the
scroller's midpoint go through the sensor's scroll branch instead, which hid it there.

**Fix.** `BoardCardPreview` keeps an untransformed outer box (what dnd-kit measures) and
tilts an inner one, so the drag rect is the card's exact rect. No custom coordinate getter.
`board-keyboard.test.tsx` runs the getter on the board's measured geometry (one column per
press, both directions; the tilted rect reproduces the old bug) and checks the preview's
outer box carries no transform; the Playwright pipeline flow presses ArrowRight once from
Wishlist and expects Applied. Rule: anything rendered in the `DragOverlay` keeps transforms
off its outermost element.

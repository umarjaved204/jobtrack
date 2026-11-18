import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRightLeft, CalendarClock, GripVertical } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { type MouseEvent, type SyntheticEvent, useEffect, useRef } from 'react';
import { Link } from 'react-router';

import { TagChip } from '@/components/tag-chip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { daysUntil, formatDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  type Application,
  type ApplicationStatus,
  applicationStatuses,
  statusLabels,
  workModeLabels,
} from '@/types/application';

import { cardName } from './board-dnd';

type BoardCardProps = {
  application: Application;
  onMoveTo: (status: ApplicationStatus) => void;
  /** True right after a drag ended, so the click that ends a drag doesn't open the card. */
  justDragged: () => boolean;
  /** Focus the drag handle once rendered (after a "Move to…" move re-mounts the card). */
  focusHandle?: boolean;
  onHandleFocused?: () => void;
};

/** Pointer events on the card's own buttons must not start a drag. */
function fromButton(event: SyntheticEvent) {
  return event.target instanceof Element && event.target.closest('button') !== null;
}

/**
 * A card on the board.
 *
 * - The company/role is a link to the detail page (Enter opens it; so does a click
 *   without dragging). The link is "stretched" over the card.
 * - Pointer: drag from anywhere on the card except its buttons (5 px / 250 ms touch hold).
 * - Keyboard: the labelled handle button picks the card up (Space/Enter, arrows, Escape).
 * - "Move to…" menu: the single-pointer / no-drag alternative (WCAG 2.2 SC 2.5.7).
 */
function BoardCard({
  application,
  onMoveTo,
  justDragged,
  focusHandle,
  onHandleFocused,
}: BoardCardProps) {
  const reduceMotion = useReducedMotion();
  const name = cardName(application);
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners = {},
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    attributes: { roleDescription: 'draggable card' },
    transition: reduceMotion ? null : undefined,
  });
  const { onKeyDown, onMouseDown, onTouchStart } = listeners as Record<
    string,
    ((event: SyntheticEvent) => void) | undefined
  >;

  const handle = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (focusHandle && handle.current) {
      handle.current.focus();
      onHandleFocused?.();
    }
  }, [focusHandle, onHandleFocused]);

  return (
    <article
      ref={setNodeRef}
      data-card={application.id}
      onMouseDown={(e) => !fromButton(e) && onMouseDown?.(e)}
      onTouchStart={(e) => !fromButton(e) && onTouchStart?.(e)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group relative rounded-md border bg-card p-3 shadow-xs select-none [-webkit-touch-callout:none]',
        'transition-shadow duration-(--duration-fast) hover:shadow-md',
        isDragging && 'border-dashed opacity-40 shadow-none',
      )}
    >
      <CardBody application={application} />
      <Link
        to={`/applications/${application.id}`}
        aria-label={name}
        onClick={(e: MouseEvent) => {
          if (justDragged()) e.preventDefault();
        }}
        draggable={false}
        className="absolute inset-0 rounded-md"
      />
      <div className="absolute top-2 right-2 z-10 flex gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Move ${name} to…`}>
              <ArrowRightLeft />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {applicationStatuses
              .filter((status) => status !== application.status)
              .map((status) => (
                <DropdownMenuItem key={status} onSelect={() => onMoveTo(status)}>
                  {statusLabels[status]}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          ref={(element) => {
            handle.current = element;
            setActivatorNodeRef(element);
          }}
          variant="ghost"
          size="icon-sm"
          className="cursor-grab active:cursor-grabbing"
          {...attributes}
          onKeyDown={onKeyDown}
          aria-label={`Move ${name}`}
          data-drag-handle={application.id}
        >
          <GripVertical />
        </Button>
      </div>
    </article>
  );
}

/** Card content, shared with the drag preview. */
function CardBody({ application }: { application: Application }) {
  // The apply-by date only matters while the role is still on the wishlist.
  const applyInDays =
    application.status === 'wishlist' && application.deadline_on
      ? daysUntil(application.deadline_on)
      : null;
  const meta = [
    application.location,
    application.work_mode ? workModeLabels[application.work_mode] : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-1.5">
      {/* Right padding only beside the top-right buttons; the rest uses the full width. */}
      <h3 className="pr-16 font-display text-base leading-tight font-semibold">
        {application.company}
      </h3>
      <p className="pr-16 text-sm">{application.role_title}</p>
      {meta.length > 0 && <p className="text-xs text-muted-foreground">{meta.join(', ')}</p>}
      {(application.tags.length > 0 || applyInDays !== null || application.applied_on) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {application.tags.slice(0, 2).map((tag) => (
            <TagChip key={tag.id} name={tag.name} color={tag.color} />
          ))}
          {application.tags.length > 2 && (
            <span className="text-xs text-muted-foreground">
              +{application.tags.length - 2} more
            </span>
          )}
          {applyInDays !== null && applyInDays >= 0 && applyInDays <= 7 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-ochre">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              {applyInDays === 0 ? 'Apply today' : `Apply in ${applyInDays}d`}
            </span>
          )}
          {application.applied_on && application.status !== 'wishlist' && (
            <span className="ml-auto figures text-xs text-muted-foreground">
              {formatDateOnly(application.applied_on, 'd MMM')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** What follows the pointer while dragging (rendered in the DragOverlay). */
function BoardCardPreview({ application }: { application: Application }) {
  return (
    <div className="rounded-md border border-rule bg-card p-3 shadow-lg">
      <CardBody application={application} />
    </div>
  );
}

export { BoardCard, BoardCardPreview };

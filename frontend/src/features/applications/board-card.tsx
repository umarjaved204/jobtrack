import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns/format';
import { GripVertical } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { type MouseEvent, type ReactNode, type SyntheticEvent, useEffect, useRef } from 'react';
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
import { monogram } from './monogram';
import { statusDotClass } from './status-classes';

type BoardCardProps = {
  application: Application;
  onMoveTo: (status: ApplicationStatus) => void;
  /** True right after a drag ended, so the click that ends a drag doesn't open the card. */
  justDragged: () => boolean;
  /** Focus the drag handle once rendered (after a "Move to…" move re-mounts the card). */
  focusHandle?: boolean;
  onHandleFocused?: () => void;
  /** While this card is being dragged, its slot reads e.g. "Drop here · position 2 of 5". */
  dropLabel?: string;
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
  dropLabel,
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
        'group relative border bg-card p-3 select-none [-webkit-touch-callout:none]',
        'transition-colors duration-(--duration-fast) hover:border-input',
        // The dragged card's slot: where it lands, outlined in the focus colour.
        isDragging && 'border-2 border-dashed border-ring bg-drop-tint hover:border-ring',
      )}
    >
      <div className={cn(isDragging && 'invisible')}>
        <CardBody
          application={application}
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="relative z-10 -mr-1.5 h-8 px-1.5 font-semibold text-muted-foreground"
                >
                  {/* The name starts with the visible label (WCAG 2.5.3), then says which card. */}
                  Move to… <span className="sr-only">{name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {applicationStatuses
                  .filter((status) => status !== application.status)
                  .map((status) => (
                    <DropdownMenuItem key={status} onSelect={() => onMoveTo(status)}>
                      <span
                        aria-hidden="true"
                        className={cn('size-2 shrink-0', statusDotClass[status])}
                      />
                      {statusLabels[status]}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>
      {isDragging && dropLabel && (
        <p
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center px-3 text-center text-[0.8125rem] font-semibold text-status-applied"
        >
          {dropLabel}
        </p>
      )}
      <Link
        to={`/applications/${application.id}`}
        aria-label={name}
        onClick={(e: MouseEvent) => {
          if (justDragged()) e.preventDefault();
        }}
        draggable={false}
        className="absolute inset-0"
      />
      <Button
        ref={(element) => {
          handle.current = element;
          setActivatorNodeRef(element);
        }}
        variant="ghost"
        size="icon-sm"
        className={cn(
          'absolute top-2 right-2 z-10 size-8 cursor-grab text-muted-foreground active:cursor-grabbing',
          isDragging && 'invisible',
        )}
        {...attributes}
        onKeyDown={onKeyDown}
        aria-label={`Move ${name}`}
        data-drag-handle={application.id}
      >
        <GripVertical />
      </Button>
    </article>
  );
}

/** The line under the role: the apply-by date on the wishlist, otherwise when it was sent. */
function StatusLine({ application }: { application: Application }) {
  if (application.status === 'wishlist') {
    if (!application.deadline_on) {
      return (
        <p className="text-[0.8125rem] text-muted-foreground">
          Saved {format(new Date(application.created_at), 'd MMM')}
        </p>
      );
    }
    const days = daysUntil(application.deadline_on);
    const soon = days >= 0 && days <= 7;
    return (
      <p
        className={cn(
          'text-[0.8125rem]',
          soon ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
      >
        Apply by {formatDateOnly(application.deadline_on, 'EEE d MMM')}
        {soon && (days === 0 ? ' · today' : ` · in ${days} ${days === 1 ? 'day' : 'days'}`)}
      </p>
    );
  }
  if (!application.applied_on) return null;
  return (
    <p className="text-[0.8125rem] text-muted-foreground">
      Applied {formatDateOnly(application.applied_on, 'd MMM')}
    </p>
  );
}

/**
 * Card content, shared with the drag preview. `action` (the card's "Move to…" menu) ends
 * the last row, opposite the tags; the preview has none.
 */
function CardBody({ application, action }: { application: Application; action?: ReactNode }) {
  const meta = [
    application.location,
    application.work_mode ? workModeLabels[application.work_mode] : null,
  ].filter(Boolean);

  return (
    <div className="relative grid gap-2">
      {/* Right padding only beside the drag handle; the rest uses the full width. */}
      <div className="flex items-start gap-2.5 pr-8">
        <span
          aria-hidden="true"
          className="grid size-[34px] shrink-0 place-items-center bg-muted display-face text-[0.9375rem] font-semibold"
        >
          {monogram(application.company)}
        </span>
        <div className="grid min-w-0">
          <h3 className="truncate text-sm font-bold">{application.company}</h3>
          {meta.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">{meta.join(' · ')}</p>
          )}
        </div>
      </div>
      <p className="font-display text-[1.1875rem] leading-tight font-medium">
        {application.role_title}
      </p>
      <StatusLine application={application} />
      {/* One wrapping row: tags first; the menu keeps right and wraps when they need the room. */}
      <div className="flex min-h-8 flex-wrap items-center gap-1">
        {application.tags.slice(0, 2).map((tag) => (
          <TagChip key={tag.id} name={tag.name} color={tag.color} />
        ))}
        {application.tags.length > 2 && (
          <span className="text-xs text-muted-foreground">+{application.tags.length - 2} more</span>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {application.status === 'offer' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1 bottom-10 -rotate-[8deg] border-2 border-primary-text px-2 py-0.5 kicker text-primary-text"
        >
          Offer
        </span>
      )}
    </div>
  );
}

/**
 * What follows the pointer while dragging (rendered in the DragOverlay): lifted and tilted.
 *
 * The tilt sits one level in, on purpose. dnd-kit takes the drag's collision rect from the
 * overlay's first child, transforms included: a tilted outer box measures ~3 px left of the
 * card, so the keyboard's first ArrowRight still "saw" the card's own column to its right
 * and stayed put. The outer box keeps the card's exact rect.
 */
function BoardCardPreview({ application }: { application: Application }) {
  return (
    <div data-drag-preview="">
      <div className="-rotate-2 border border-rule bg-card p-3 shadow-[0_18px_30px_rgb(var(--shadow-rgb)/0.22),0_2px_0_var(--rule)]">
        <CardBody application={application} />
      </div>
    </div>
  );
}

export { BoardCard, BoardCardPreview };

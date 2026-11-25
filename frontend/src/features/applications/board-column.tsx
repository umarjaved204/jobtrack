import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type Application, type ApplicationStatus, statusLabels } from '@/types/application';

import { statusDotClass } from './status-classes';

type BoardColumnProps = {
  status: ApplicationStatus;
  applications: Application[];
  onAdd: () => void;
  children: ReactNode;
};

/** Rejected and Withdrawn: outcomes, not stages. Narrower, on a shaded ground. */
const EXITS: ReadonlySet<ApplicationStatus> = new Set(['rejected', 'withdrawn']);

/**
 * One status column: kicker heading with a square status dot, the count as a Fraunces
 * figure, an add button, and a drop area that's always there (an empty column still
 * accepts cards). Columns share the board's ink top rule and hairlines between them.
 * Horizontal snap point on small screens.
 */
function BoardColumn({ status, applications, onAdd, children }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const headingId = `column-${status}`;

  return (
    <section
      aria-labelledby={headingId}
      data-column={status}
      className={cn(
        'flex w-[85vw] max-w-80 shrink-0 snap-start flex-col border-r px-3 pt-3.5 pb-5 last:border-r-0',
        // Phones show one column at a time: cap its height and scroll its cards inside it,
        // or the page runs on to the height of the longest (hidden) column.
        'max-sm:max-h-[75dvh]',
        EXITS.has(status) ? 'bg-accent sm:w-56' : 'sm:w-64',
      )}
    >
      <header className="flex items-center gap-2 border-b border-rule pb-2.5">
        <span aria-hidden="true" className={cn('size-[9px] shrink-0', statusDotClass[status])} />
        <h2 id={headingId} className="kicker text-[0.8125rem] font-bold text-foreground">
          {statusLabels[status]}
        </h2>
        <span className="ml-auto display-face text-[1.375rem] leading-none font-medium tabular-nums">
          {applications.length}
          <span className="sr-only">
            {' '}
            {applications.length === 1 ? 'application' : 'applications'}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-2"
          aria-label={`Add to ${statusLabels[status]}`}
          onClick={onAdd}
        >
          <Plus />
        </Button>
      </header>
      <SortableContext
        id={status}
        items={applications.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol
          ref={setNodeRef}
          className={cn(
            'flex min-h-28 flex-1 flex-col gap-2.5 pt-2.5 transition-colors duration-(--duration-fast)',
            // The 4px gutter keeps cards' focus outlines inside the scroll box.
            'max-sm:-mx-1 max-sm:overflow-y-auto max-sm:overscroll-y-contain max-sm:px-1 max-sm:pb-1',
            isOver && 'bg-drop-tint',
          )}
        >
          {children}
          {applications.length === 0 && (
            <li
              aria-hidden="true"
              className="grid flex-1 place-items-center border border-dashed border-input px-3 py-6 text-center text-xs text-muted-foreground"
            >
              Drop a card here
            </li>
          )}
        </ol>
      </SortableContext>
    </section>
  );
}

export { BoardColumn };

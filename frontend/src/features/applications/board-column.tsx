import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type Application, type ApplicationStatus, statusLabels } from '@/types/application';

/* Full class strings so Tailwind sees them (status ramp tokens). */
const statusDot: Record<ApplicationStatus, string> = {
  wishlist: 'bg-status-wishlist',
  applied: 'bg-status-applied',
  screening: 'bg-status-screening',
  interview: 'bg-status-interview',
  offer: 'bg-status-offer',
  rejected: 'bg-status-rejected',
  withdrawn: 'bg-status-withdrawn',
};

type BoardColumnProps = {
  status: ApplicationStatus;
  applications: Application[];
  onAdd: () => void;
  children: ReactNode;
};

/** One status column: heading with count, an add button, and a drop area that's always
 * there (an empty column still accepts cards). Horizontal snap point on small screens. */
function BoardColumn({ status, applications, onAdd, children }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const headingId = `column-${status}`;

  return (
    <section
      aria-labelledby={headingId}
      data-column={status}
      className="flex w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-lg bg-paper-sunken/60 sm:w-72"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <span aria-hidden="true" className={cn('size-2 rounded-full', statusDot[status])} />
        <h2 id={headingId} className="font-sans text-sm font-semibold">
          {statusLabels[status]}
        </h2>
        <span className="figures text-xs text-muted-foreground">
          {applications.length}
          <span className="sr-only">
            {' '}
            {applications.length === 1 ? 'application' : 'applications'}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
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
            'flex min-h-28 flex-1 flex-col gap-2 p-2 transition-colors duration-(--duration-fast)',
            isOver && 'bg-primary-tint/60',
          )}
        >
          {children}
          {applications.length === 0 && (
            <li
              aria-hidden="true"
              className="grid flex-1 place-items-center rounded-md border border-dashed border-input px-3 py-6 text-center text-xs text-muted-foreground"
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

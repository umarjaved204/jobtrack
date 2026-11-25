import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import { type ApplicationStatus, applicationStatuses, statusLabels } from '@/types/application';

type BoardColumnNavProps = {
  counts: Record<ApplicationStatus, number>;
  /** The column most in view; its chip is filled and marked current. */
  current: ApplicationStatus;
  onJump: (status: ApplicationStatus) => void;
};

/**
 * Phones only: one chip per column (name and count) above the board, which shows one
 * column at a time. A chip scrolls the board to its column; swiping the board moves the
 * filled chip, and the chip row follows so the current one stays in view.
 */
function BoardColumnNav({ counts, current, onJump }: BoardColumnNavProps) {
  const row = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = row.current;
    const chip = list?.querySelector<HTMLElement>(`[data-chip="${current}"]`);
    if (!list || !chip) return;
    // Scroll the chip row only (scrollIntoView could also move the page).
    const { left, right } = chip.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    if (left < box.left || right > box.right) {
      list.scrollTo({ left: chip.offsetLeft - 20 }); // 20px: the row's own side padding
    }
  }, [current]);

  return (
    <nav aria-label="Columns" className="-mx-5 mb-3">
      <ul
        ref={row}
        className="relative flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-5 pb-1 [&::-webkit-scrollbar]:hidden"
      >
        {applicationStatuses.map((status) => {
          const selected = status === current;
          return (
            <li key={status} className="shrink-0">
              <button
                type="button"
                data-chip={status}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onJump(status)}
                className={cn(
                  'inline-flex h-9 cursor-pointer items-center gap-1.5 border border-rule px-2.5 text-[0.8125rem] font-semibold whitespace-nowrap',
                  selected ? 'bg-foreground text-background' : 'text-foreground hover:bg-accent',
                )}
              >
                {/* A real space: the flex gap is visual only, and the name needs one. */}
                {statusLabels[status]}{' '}
                <span className="figures font-normal">
                  {counts[status]}{' '}
                  <span className="sr-only">
                    {counts[status] === 1 ? 'application' : 'applications'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { BoardColumnNav };

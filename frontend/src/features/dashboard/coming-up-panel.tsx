import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router';

import { StatusBadge } from '@/components/status-badge';
import { formatDateOnly } from '@/lib/dates';
import type { Board, DateOnly } from '@/types/application';

import { comingUp, type Deadline, LOOKAHEAD_DAYS, OVERDUE_DAYS, relativeDue } from './coming-up';

/** Long lists stop here, with a count of the rest: this panel is a nudge, not an inbox. */
const SHOWN = 5;

function DeadlineList({ deadlines, overdue }: { deadlines: Deadline[]; overdue: boolean }) {
  const shown = deadlines.slice(0, SHOWN);
  const more = deadlines.length - shown.length;
  return (
    <>
      <ul className="divide-y">
        {shown.map(({ application: a, deadline, days }) => (
          <li key={a.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-3">
            <span className="row-span-2 grid content-start">
              <time dateTime={deadline} className="figures text-sm font-semibold">
                {formatDateOnly(deadline, 'd MMM')}
              </time>
              <span
                className={overdue ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
              >
                {relativeDue(days)}
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <Link
                to={`/applications/${a.id}`}
                className="truncate font-semibold underline-offset-4 hover:underline"
              >
                {a.company}
              </Link>
              <StatusBadge status={a.status} />
            </span>
            <span className="truncate text-sm text-muted-foreground">{a.role_title}</span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="text-sm text-muted-foreground">
          And {more} more {overdue ? 'past their deadline' : 'due soon'}.
        </p>
      )}
    </>
  );
}

/**
 * Apply-by dates for roles on the wishlist, from the board (every application) and the
 * browser's own calendar day. Missed ones come first, in their own group; older than
 * OVERDUE_DAYS they're only counted. Assessments and reminders join in Phase 8.
 */
function ComingUpPanel({ board, today }: { board: Board; today: DateOnly }) {
  const { overdue, olderOverdue, upcoming } = comingUp(board, today);
  const missed = overdue.length + olderOverdue;

  return (
    <section aria-labelledby="coming-up-heading" className="grid content-start gap-4">
      <div className="grid gap-1">
        <h2 id="coming-up-heading" className="font-display text-2xl font-semibold">
          Coming up
        </h2>
        <p className="text-sm text-muted-foreground">
          Apply-by dates for roles on your wishlist, over the next {LOOKAHEAD_DAYS} days.
        </p>
      </div>

      {missed > 0 && (
        <section aria-labelledby="overdue-heading" className="grid gap-1">
          <h3
            id="overdue-heading"
            className="flex items-center gap-1.5 text-sm font-semibold text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-4" />
            Past the deadline ({missed})
          </h3>
          <DeadlineList deadlines={overdue} overdue />
          {olderOverdue > 0 && (
            <p className="text-sm text-muted-foreground">
              +{olderOverdue} older (more than {OVERDUE_DAYS} days ago).
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="upcoming-heading" className="grid gap-1">
        <h3 id="upcoming-heading" className="text-sm font-semibold">
          Due soon ({upcoming.length})
        </h3>
        {upcoming.length > 0 ? (
          <DeadlineList deadlines={upcoming} overdue={false} />
        ) : (
          <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
            Nothing to apply for in the next {LOOKAHEAD_DAYS} days. Give a wishlist role an apply-by
            date to see it here.
          </p>
        )}
      </section>
    </section>
  );
}

export { ComingUpPanel };

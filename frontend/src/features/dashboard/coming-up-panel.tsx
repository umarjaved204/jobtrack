import { AlertCircle, Bell, CalendarClock, Send } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';

import { Checkbox } from '@/components/ui/checkbox';
import { itemTimeText } from '@/features/calendar/month';
import { localTime } from '@/features/reminders/due';
import { useToggleDone } from '@/features/reminders/use-toggle-done';
import { formatDateOnly } from '@/lib/dates';
import type { DateOnly } from '@/types/application';
import { eventKindLabels } from '@/types/calendar';

import {
  type ComingUpSources,
  comingUp,
  type Entry,
  LOOKAHEAD_DAYS,
  OVERDUE_DAYS,
  relativeDue,
} from './coming-up';

/** Long lists stop here, with a count of the rest: this panel is a nudge, not an inbox. */
const SHOWN = 5;

const ICONS = { apply_by: Send, event: CalendarClock, reminder: Bell } as const;
const linkClass = 'font-semibold underline-offset-4 hover:underline';

function EntryBody({ entry, onToggle }: { entry: Entry; onToggle: Toggle }) {
  const id = useId();
  if (entry.kind === 'apply_by') {
    const a = entry.application;
    return (
      <>
        <Link to={`/applications/${a.id}`} className={`truncate ${linkClass}`}>
          Apply to {a.company}
        </Link>
        <span className="truncate text-sm text-muted-foreground">{a.role_title}</span>
      </>
    );
  }
  if (entry.kind === 'event') {
    const { event } = entry;
    const where = `/calendar?month=${entry.day.slice(0, 7)}&day=${entry.day}`;
    return (
      <>
        <Link to={where} className={`truncate ${linkClass}`}>
          {event.title}
        </Link>
        <span className="truncate text-sm text-muted-foreground">
          {eventKindLabels[event.kind]}, {itemTimeText(event)}
          {event.application && `, ${event.application.company}`}
        </span>
      </>
    );
  }
  const { reminder } = entry;
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={id}
          checked={false}
          disabled={onToggle.pendingId === reminder.id}
          onCheckedChange={() => onToggle.toggle(reminder, true)}
        />
        <label htmlFor={id} className="cursor-pointer truncate font-semibold">
          {reminder.title}
        </label>
      </span>
      <span className="truncate text-sm text-muted-foreground">
        {reminder.due_at ? `Follow-up at ${localTime(reminder.due_at)}` : 'Follow-up'}
        {reminder.application && (
          <>
            {', '}
            <Link
              to={`/applications/${reminder.application.id}`}
              className="underline-offset-4 hover:underline"
            >
              {reminder.application.company}
            </Link>
          </>
        )}
      </span>
    </>
  );
}

type Toggle = ReturnType<typeof useToggleDone>;

function EntryList({
  entries,
  overdue,
  toggle,
}: {
  entries: Entry[];
  overdue: boolean;
  toggle: Toggle;
}) {
  const shown = entries.slice(0, SHOWN);
  const more = entries.length - shown.length;
  return (
    <>
      <ul className="divide-y">
        {shown.map((entry) => {
          const Icon = ICONS[entry.kind];
          return (
            <li
              key={entry.key}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-3"
            >
              <span className="row-span-2 grid content-start">
                <time dateTime={entry.day} className="figures text-sm font-semibold">
                  {formatDateOnly(entry.day, 'd MMM')}
                </time>
                <span
                  className={overdue ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
                >
                  {relativeDue(entry.days)}
                </span>
              </span>
              <span className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                <Icon aria-hidden="true" className="mt-1 size-4 text-muted-foreground" />
                <span className="grid min-w-0 gap-0.5">
                  <EntryBody entry={entry} onToggle={toggle} />
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <p className="text-sm text-muted-foreground">
          And {more} more {overdue ? 'overdue' : 'coming up'}.
        </p>
      )}
    </>
  );
}

/**
 * Apply-by dates for wishlist roles, open follow-ups, and interviews, assessments and
 * deadlines over the next LOOKAHEAD_DAYS days, against the browser's own day and clock.
 * Overdue items come first, in their own group; older than OVERDUE_DAYS they're only
 * counted. Definitions: docs/architecture.md ("Dashboard metrics").
 */
function ComingUpPanel({ sources, today }: { sources: ComingUpSources; today: DateOnly }) {
  const { overdue, olderOverdue, upcoming } = comingUp(sources, today);
  // One for the panel (it stays mounted), not one per list: marking the last overdue one
  // done removes that list.
  const toggle = useToggleDone();
  const missed = overdue.length + olderOverdue;

  return (
    <section aria-labelledby="coming-up-heading" className="grid content-start gap-4">
      <div className="grid gap-1">
        <h2 id="coming-up-heading" className="font-display text-2xl font-semibold">
          Coming up
        </h2>
        <p className="text-sm text-muted-foreground">
          Interviews, assessments, deadlines, follow-ups and apply-by dates over the next{' '}
          {LOOKAHEAD_DAYS} days.
        </p>
      </div>

      {missed > 0 && (
        <section aria-labelledby="overdue-heading" className="grid gap-1">
          <h3
            id="overdue-heading"
            className="flex items-center gap-1.5 text-sm font-semibold text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-4" />
            Overdue ({missed})
          </h3>
          <EntryList entries={overdue} overdue toggle={toggle} />
          {olderOverdue > 0 && (
            <p className="text-sm text-muted-foreground">
              +{olderOverdue} older (more than {OVERDUE_DAYS} days ago).
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="upcoming-heading" className="grid gap-1">
        <h3 id="upcoming-heading" className="text-sm font-semibold">
          Next {LOOKAHEAD_DAYS} days ({upcoming.length})
        </h3>
        {upcoming.length > 0 ? (
          <EntryList entries={upcoming} overdue={false} toggle={toggle} />
        ) : (
          <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
            Nothing in the next {LOOKAHEAD_DAYS} days. Add interviews and follow-ups on the{' '}
            <Link to="/calendar" className="text-primary-text underline underline-offset-4">
              Calendar
            </Link>
            , or an apply-by date to a wishlist role.
          </p>
        )}
      </section>
    </section>
  );
}

export { ComingUpPanel };

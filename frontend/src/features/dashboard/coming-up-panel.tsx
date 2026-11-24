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
import { cn } from '@/lib/utils';

import {
  type ComingUpSources,
  comingUp,
  type Entry,
  LOOKAHEAD_DAYS,
  OVERDUE_DAYS,
  relativeDue,
} from './coming-up';
import { SectionHeading } from './section-heading';

/** Long lists stop here, with a count of the rest: this panel is a nudge, not an inbox. */
const SHOWN = 5;

const ICONS = { apply_by: Send, event: CalendarClock, reminder: Bell } as const;
const linkClass = 'font-semibold underline-offset-4 hover:underline';

/** The kicker over each entry: what kind of thing it is. */
function typeLabel(entry: Entry): string {
  if (entry.kind === 'apply_by') return 'Apply by';
  if (entry.kind === 'event') return eventKindLabels[entry.event.kind];
  return 'Follow-up';
}

/**
 * Title and detail line. `overdue` entries sit on the overdue tint, where text must be ink
 * or destructive (tokens.css), so their detail line is ink instead of secondary.
 */
function EntryBody({
  entry,
  onToggle,
  overdue,
}: {
  entry: Entry;
  onToggle: Toggle;
  overdue: boolean;
}) {
  const id = useId();
  const detail = cn('truncate text-sm', overdue ? 'text-foreground' : 'text-muted-foreground');
  if (entry.kind === 'apply_by') {
    const a = entry.application;
    return (
      <>
        <Link to={`/applications/${a.id}`} className={`truncate ${linkClass}`}>
          Apply to {a.company}
        </Link>
        <span className={detail}>{a.role_title}</span>
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
        <span className={detail}>
          {itemTimeText(event)}
          {event.application && `, ${event.application.company}`}
        </span>
      </>
    );
  }
  const { reminder } = entry;
  const time = reminder.due_at ? `At ${localTime(reminder.due_at)}` : null;
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
      {(time || reminder.application) && (
        <span className={detail}>
          {time}
          {time && reminder.application && ', '}
          {reminder.application && (
            <Link
              to={`/applications/${reminder.application.id}`}
              className="underline-offset-4 hover:underline"
            >
              {reminder.application.company}
            </Link>
          )}
        </span>
      )}
    </>
  );
}

type Toggle = ReturnType<typeof useToggleDone>;

/** Weekday over a big day number over the month, like a desk calendar's leaf. */
function DateLeaf({ day, overdue }: { day: DateOnly; overdue: boolean }) {
  const small = cn('kicker', overdue ? 'text-foreground' : 'text-muted-foreground');
  return (
    <time dateTime={day} className="grid content-start justify-items-start">
      <span className={small}>{formatDateOnly(day, 'EEE')}</span>{' '}
      <span className="display-face text-[2.125rem] leading-none font-medium tabular-nums">
        {formatDateOnly(day, 'd')}
      </span>{' '}
      <span className={small}>{formatDateOnly(day, 'MMM')}</span>
    </time>
  );
}

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
      <ul className={cn('divide-y', overdue && 'bg-overdue-tint px-4')}>
        {shown.map((entry) => {
          const Icon = ICONS[entry.kind];
          return (
            <li key={entry.key} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4 py-3.5">
              <DateLeaf day={entry.day} overdue={overdue} />
              <span className="grid min-w-0 content-start gap-0.5">
                <span
                  className={cn(
                    'flex items-center gap-1.5 kicker',
                    overdue ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  <span>{typeLabel(entry)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{relativeDue(entry.days)}</span>
                </span>
                <EntryBody entry={entry} onToggle={toggle} overdue={overdue} />
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
      <SectionHeading
        id="coming-up-heading"
        title="Coming up"
        link={{ to: '/calendar', label: 'Open calendar' }}
      >
        Interviews, assessments, deadlines, follow-ups and apply-by dates over the next{' '}
        {LOOKAHEAD_DAYS} days.
      </SectionHeading>

      {missed > 0 && (
        <section aria-labelledby="overdue-heading" className="grid gap-1">
          <h3
            id="overdue-heading"
            className="flex items-center gap-1.5 py-1 kicker text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-3.5" />
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
        <h3 id="upcoming-heading" className="py-1 kicker text-muted-foreground">
          Next {LOOKAHEAD_DAYS} days ({upcoming.length})
        </h3>
        {upcoming.length > 0 ? (
          <EntryList entries={upcoming} overdue={false} toggle={toggle} />
        ) : (
          <p className="border border-dashed border-border-quiet px-4 py-6 text-sm text-muted-foreground">
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

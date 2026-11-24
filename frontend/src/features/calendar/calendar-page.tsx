import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronLeft, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteReminder } from '@/features/reminders/api';
import {
  ReminderFormDialog,
  type ReminderFormMode,
} from '@/features/reminders/reminder-form-dialog';
import { useToggleDone } from '@/features/reminders/use-toggle-done';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isApiError } from '@/lib/api/errors';
import { todayDateOnly } from '@/lib/dates';
import type { DateOnly } from '@/types/application';
import type { CalendarEvent } from '@/types/calendar';
import type { Reminder } from '@/types/reminder';

import { calendarFeedQuery, useDeleteEvent } from './api';
import { type DayItemHandlers, DayItems } from './day-items';
import { EventFormDialog, type EventFormMode } from './event-form-dialog';
import { MonthGrid } from './month-grid';
import {
  dayHeading,
  feedRange,
  isDay,
  itemsByDay,
  type Month,
  monthLabel,
  monthWeeks,
  parseMonth,
  shiftMonth,
} from './month';

/** Wide enough for seven day columns; below this the month is an agenda list. */
const GRID_LAYOUT = '(min-width: 48rem)';
const errorText = (error: unknown) => (isApiError(error) ? error.detail : 'Try again in a moment.');

function CalendarPage() {
  const today = todayDateOnly();
  const [params, setParams] = useSearchParams();
  const month = parseMonth(params.get('month'), today);
  const weeks = monthWeeks(month);
  const days = weeks.flat();
  const wanted = params.get('day');
  const selected: DateOnly =
    isDay(wanted) && days.includes(wanted)
      ? wanted
      : today.startsWith(month)
        ? today
        : `${month}-01`;

  const range = feedRange(days[0] ?? `${month}-01`, days.at(-1) ?? `${month}-01`);
  const feed = useQuery(calendarFeedQuery(range));
  const byDay = itemsByDay(feed.data?.items ?? []);
  const wide = useMediaQuery(GRID_LAYOUT);

  const [eventForm, setEventForm] = useState<EventFormMode | null>(null);
  const [reminderForm, setReminderForm] = useState<ReminderFormMode | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<CalendarEvent | null>(null);
  const [deletingReminder, setDeletingReminder] = useState<Reminder | null>(null);
  const deleteEvent = useDeleteEvent();
  const deleteReminder = useDeleteReminder();
  const { toggle, pendingId } = useToggleDone();
  const dayHeadingRef = useRef<HTMLHeadingElement>(null);

  const go = (next: { month?: Month; day?: DateOnly }) =>
    setParams(
      { month: next.month ?? month, ...(next.day ? { day: next.day } : {}) },
      { replace: true, preventScrollReset: true },
    );
  const openDay = (day: DateOnly) => {
    go({ day }); // a day from a neighbouring month stays in this month's view
    requestAnimationFrame(() => dayHeadingRef.current?.focus());
  };

  const handlers: DayItemHandlers = {
    now: new Date(),
    onEditEvent: (event) => setEventForm({ type: 'edit', event }),
    onDeleteEvent: (event) => {
      deleteEvent.reset();
      setDeletingEvent(event);
    },
    onToggleReminder: (reminder) => toggle(reminder),
    onEditReminder: (reminder) => setReminderForm({ type: 'edit', reminder }),
    onDeleteReminder: (reminder) => {
      deleteReminder.reset();
      setDeletingReminder(reminder);
    },
    pendingReminderId: pendingId,
  };
  const addButtons = (day: DateOnly, size: 'sm' | 'default' = 'default') => (
    <>
      <Button size={size} onClick={() => setEventForm({ type: 'create', day })}>
        <Plus /> Add event
      </Button>
      <Button
        size={size}
        variant="outline"
        onClick={() => setReminderForm({ type: 'create', applicationId: null, date: day })}
      >
        <Bell /> Add follow-up
      </Button>
    </>
  );

  let body;
  if (feed.isPending) {
    body = (
      <div aria-busy="true" aria-label="Loading the calendar" className="mt-6 grid gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  } else if (feed.isError) {
    body = (
      <Alert title="The calendar didn’t load" className="mt-6 max-w-xl">
        <p>{errorText(feed.error)}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void feed.refetch()}>
          <RotateCcw /> Try again
        </Button>
      </Alert>
    );
  } else if (wide) {
    const selectedItems = byDay.get(selected) ?? [];
    body = (
      <div
        className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]"
        aria-busy={feed.isPlaceholderData || undefined}
      >
        <MonthGrid
          month={month}
          weeks={weeks}
          today={today}
          selected={selected}
          items={byDay}
          labelledBy="month-heading"
          onMonthChange={(next, day) => go({ month: next, day })}
          onOpenDay={openDay}
        />
        <section
          aria-labelledby="day-heading"
          className="grid content-start gap-3 border-t-[3px] border-rule pt-3.5"
        >
          <p className="kicker text-muted-foreground">Selected day</p>
          <h2
            id="day-heading"
            ref={dayHeadingRef}
            tabIndex={-1}
            className="font-display text-[2rem] leading-tight font-semibold outline-none"
          >
            {dayHeading(selected)}
          </h2>
          <div className="flex flex-wrap gap-2">{addButtons(selected, 'sm')}</div>
          {selectedItems.length > 0 ? (
            <DayItems items={selectedItems} handlers={handlers} label="On this day" />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing on this day.</p>
          )}
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">
            Arrow keys move between days, Page Up and Page Down change month, Enter opens a day.
          </p>
        </section>
      </div>
    );
  } else {
    const agendaDays = days.filter((day) => day.startsWith(month) && byDay.has(day));
    body = (
      <div className="mt-6 grid gap-8" aria-busy={feed.isPlaceholderData || undefined}>
        {agendaDays.length === 0 && (
          <p className="text-muted-foreground">Nothing scheduled in {monthLabel(month)}.</p>
        )}
        {agendaDays.map((day) => (
          <section key={day} aria-labelledby={`agenda-${day}`} className="grid gap-3">
            <h3
              id={`agenda-${day}`}
              className="border-b border-rule pb-1.5 font-display text-xl font-semibold"
            >
              {dayHeading(day)}
              {day === today && <span className="text-primary-text"> (today)</span>}
            </h3>
            <DayItems items={byDay.get(day) ?? []} handlers={handlers} label={dayHeading(day)} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Schedule"
        title="Calendar"
        description="Interviews, assessments, deadlines and follow-ups in one place."
        actions={addButtons(selected)}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="month-heading"
          aria-live="polite"
          className="font-display text-[2.5rem] leading-none font-semibold"
        >
          {monthLabel(month)}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => go({ month: shiftMonth(month, -1) })}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => go({ month: today.slice(0, 7), day: today })}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => go({ month: shiftMonth(month, 1) })}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      {body}

      <EventFormDialog
        mode={eventForm}
        onClose={() => setEventForm(null)}
        onSaved={(event) => toast.success(`Saved ${event.title}`)}
      />
      <ReminderFormDialog mode={reminderForm} onClose={() => setReminderForm(null)} />
      <ConfirmDialog
        open={deletingEvent !== null}
        onOpenChange={(open) => !open && setDeletingEvent(null)}
        title={`Delete ${deletingEvent?.title ?? 'this event'}?`}
        description="It’s removed from your calendar. This can’t be undone."
        confirmLabel="Delete event"
        pending={deleteEvent.isPending}
        error={deleteEvent.isError ? errorText(deleteEvent.error) : null}
        onConfirm={() => {
          if (deletingEvent) {
            deleteEvent.mutate(deletingEvent.id, { onSuccess: () => setDeletingEvent(null) });
          }
        }}
      />
      <ConfirmDialog
        open={deletingReminder !== null}
        onOpenChange={(open) => !open && setDeletingReminder(null)}
        title="Delete this follow-up?"
        description={
          deletingReminder ? `“${deletingReminder.title}” is removed. This can’t be undone.` : ''
        }
        confirmLabel="Delete follow-up"
        pending={deleteReminder.isPending}
        error={deleteReminder.isError ? errorText(deleteReminder.error) : null}
        onConfirm={() => {
          if (deletingReminder) {
            deleteReminder.mutate(deletingReminder.id, {
              onSuccess: () => setDeletingReminder(null),
            });
          }
        }}
      />
    </>
  );
}

export { CalendarPage };

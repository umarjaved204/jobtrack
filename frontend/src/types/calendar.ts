import type { DateOnly } from './application';
import type { ApplicationRef } from './reminder';

/*
 * Calendar shapes. Mirror backend/app/schemas/calendar.py. Events are always timed
 * (instants in UTC); the merged feed adds date-only items (apply-by dates, all-day
 * reminders), which carry `date` and are never converted through UTC.
 */

export const eventKinds = ['interview', 'assessment', 'deadline', 'other'] as const;
export type CalendarEventKind = (typeof eventKinds)[number];

export const eventKindLabels: Record<CalendarEventKind, string> = {
  interview: 'Interview',
  assessment: 'Assessment',
  deadline: 'Deadline',
  other: 'Other',
};

/** What each kind is for (the form's hint). "Apply by" lives on the application. */
export const eventKindHints: Record<CalendarEventKind, string> = {
  interview: 'Any interview round: screen, technical, onsite.',
  assessment: 'A take-home or online test, with its window.',
  deadline: 'Something due other than applying: replying to an offer, sending documents.',
  other: 'Anything else: a coffee chat, a careers fair.',
};

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  /** ISO instant in UTC. */
  starts_at: string;
  ends_at: string | null;
  location_or_link: string | null;
  application: ApplicationRef | null;
};

export type CalendarEventInput = {
  kind: CalendarEventKind;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location_or_link?: string | null;
  application_id?: string | null;
};

export type CalendarEventPatch = Partial<CalendarEventInput>;

export type EventItem = CalendarEvent & { type: 'event' };
export type ApplyByItem = {
  type: 'apply_by';
  /** The application's id. */
  id: string;
  title: string;
  date: DateOnly;
  application: ApplicationRef;
};
export type ReminderItem = {
  type: 'reminder';
  id: string;
  title: string;
  /** All-day reminders carry `date`, timed ones `starts_at`. */
  date: DateOnly | null;
  starts_at: string | null;
  done_at: string | null;
  application: ApplicationRef | null;
};
export type CalendarItem = EventItem | ApplyByItem | ReminderItem;

export type CalendarFeed = { items: CalendarItem[] };

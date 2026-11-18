import type { DateOnly } from './application';

/*
 * GET/POST/PATCH /reminders shapes. Mirror backend/app/schemas/reminder.py.
 * A reminder is either all-day (`due_on`, a plain date that never moves between time
 * zones) or timed (`due_at`, an instant returned in UTC). Exactly one is set.
 * Reminders are in-app only: nothing is emailed or pushed.
 */

/** Enough to label and link to the application a reminder or event belongs to. */
export type ApplicationRef = { id: string; company: string; role_title: string };

export type Reminder = {
  id: string;
  title: string;
  application: ApplicationRef | null;
  due_on: DateOnly | null;
  /** ISO 8601 instant in UTC ("…Z"). */
  due_at: string | null;
  done_at: string | null;
};

export type ReminderStatus = 'open' | 'done' | 'all';

export type ReminderFilters = { status?: ReminderStatus; application_id?: string };

/** POST body: `due_on` (all day) or `due_at` (an instant with an offset), not both. */
export type ReminderInput = {
  title: string;
  application_id?: string | null;
  due_on?: DateOnly;
  due_at?: string;
};

/** PATCH: sending `due_on` makes it all-day and `due_at` timed; `done` marks or reopens. */
export type ReminderPatch = {
  title?: string;
  application_id?: string | null;
  due_on?: DateOnly;
  due_at?: string;
  done?: boolean;
};

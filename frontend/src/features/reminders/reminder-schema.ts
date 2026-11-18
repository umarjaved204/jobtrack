import { addDays } from 'date-fns/addDays';
import { z } from 'zod';

import { isDateOnly, parseDateOnly, toDateOnly } from '@/lib/dates';
import type { Reminder, ReminderInput, ReminderPatch } from '@/types/reminder';

import { localDay, localTime, toInstant, type Zone } from './due';

/*
 * The reminder form works on a date and an optional time, both in the browser's zone.
 * No time = an all-day reminder (sent as `due_on`, a plain date); with a time it's sent
 * as `due_at`, an instant in UTC. Mirrors backend/app/schemas/reminder.py.
 */

export const reminderFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Say what to do, like “Chase the recruiter”')
    .max(200, 'Keep it under 200 characters'),
  date: z.string().refine(isDateOnly, 'Pick a date'),
  time: z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Enter a time, like 09:30'),
});

export type ReminderFormValues = z.input<typeof reminderFormSchema>;
export const reminderFields = ['title', 'date', 'time'] as const;

/** A new follow-up defaults to all day, a week from today: a common follow-up gap. */
export function newReminderValues(today: string): ReminderFormValues {
  return { title: '', date: toDateOnly(addDays(parseDateOnly(today), 7)), time: '' };
}

export function reminderFormValues(reminder: Reminder, zone?: Zone): ReminderFormValues {
  return reminder.due_at
    ? {
        title: reminder.title,
        date: localDay(reminder.due_at, zone),
        time: localTime(reminder.due_at, zone),
      }
    : { title: reminder.title, date: reminder.due_on ?? '', time: '' };
}

function due(values: ReminderFormValues, zone?: Zone) {
  return values.time
    ? { due_at: toInstant(values.date, values.time, zone) }
    : { due_on: values.date };
}

export function toReminderInput(
  values: ReminderFormValues,
  applicationId: string | null,
  zone?: Zone,
): ReminderInput {
  return { title: values.title.trim(), application_id: applicationId, ...due(values, zone) };
}

/** Only what changed; a changed date or time resends the due date (all-day or timed). */
export function toReminderPatch(
  values: ReminderFormValues,
  changed: Partial<Record<keyof ReminderFormValues, unknown>>,
  zone?: Zone,
): ReminderPatch {
  return {
    ...(changed.title ? { title: values.title.trim() } : {}),
    ...(changed.date || changed.time ? due(values, zone) : {}),
  };
}

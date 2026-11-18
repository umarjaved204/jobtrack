import { z } from 'zod';

import { NO_RESUME as NONE } from '@/features/applications/application-schema';
import { localDay, localTime, toInstant, type Zone } from '@/features/reminders/due';
import { isDateOnly } from '@/lib/dates';
import {
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarEventPatch,
  eventKinds,
} from '@/types/calendar';

/*
 * The event form: local dates and times (the browser's zone), converted to UTC instants on
 * submit. Events are always timed; the end is optional. Mirrors
 * backend/app/schemas/calendar.py (the server re-checks the order of start and end).
 */

export const NO_APPLICATION = NONE;
const TIME = /^\d{2}:\d{2}$/;

export const eventFormSchema = z
  .object({
    kind: z.enum(eventKinds),
    title: z
      .string()
      .trim()
      .min(1, 'Name it, like “Technical interview”')
      .max(200, 'Keep it under 200 characters'),
    start_date: z.string().refine(isDateOnly, 'Pick a date'),
    start_time: z.string().refine((v) => TIME.test(v), 'Pick a start time'),
    end_date: z.string().refine((v) => v === '' || isDateOnly(v), 'Enter a valid date'),
    end_time: z.string().refine((v) => v === '' || TIME.test(v), 'Enter a time, like 15:30'),
    location_or_link: z.string().trim().max(2048, 'Keep it under 2,048 characters'),
    application_id: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.end_time || !TIME.test(v.start_time) || !isDateOnly(v.start_date)) return;
    const end = toInstant(v.end_date || v.start_date, v.end_time);
    if (end < toInstant(v.start_date, v.start_time)) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_time'],
        message: 'The end can’t be before the start',
      });
    }
  });

export type EventFormValues = z.input<typeof eventFormSchema>;
export const eventFields = Object.keys(eventFormSchema.shape) as (keyof EventFormValues)[];

/** A new event on `day`: 09:00 to 10:00, an interview (the most common). */
export function newEventValues(day: string, applicationId?: string): EventFormValues {
  return {
    kind: 'interview',
    title: '',
    start_date: day,
    start_time: '09:00',
    end_date: '',
    end_time: '10:00',
    location_or_link: '',
    application_id: applicationId ?? NO_APPLICATION,
  };
}

export function eventFormValues(event: CalendarEvent, zone?: Zone): EventFormValues {
  const startDay = localDay(event.starts_at, zone);
  const endDay = event.ends_at ? localDay(event.ends_at, zone) : '';
  return {
    kind: event.kind,
    title: event.title,
    start_date: startDay,
    start_time: localTime(event.starts_at, zone),
    end_date: endDay === startDay ? '' : endDay, // only shown when it's another day
    end_time: event.ends_at ? localTime(event.ends_at, zone) : '',
    location_or_link: event.location_or_link ?? '',
    application_id: event.application?.id ?? NO_APPLICATION,
  };
}

export function toEventInput(v: EventFormValues, zone?: Zone): CalendarEventInput {
  return {
    kind: v.kind,
    title: v.title.trim(),
    starts_at: toInstant(v.start_date, v.start_time, zone),
    ends_at: v.end_time ? toInstant(v.end_date || v.start_date, v.end_time, zone) : null,
    location_or_link: v.location_or_link.trim() || null,
    application_id: v.application_id === NO_APPLICATION ? null : v.application_id,
  };
}

/** Changed fields only; a change to any date or time resends both ends. */
export function toEventPatch(
  v: EventFormValues,
  changed: Partial<Record<keyof EventFormValues, unknown>>,
  zone?: Zone,
): CalendarEventPatch {
  const full = toEventInput(v, zone);
  const patch: CalendarEventPatch = {};
  if (changed.kind) patch.kind = full.kind;
  if (changed.title) patch.title = full.title;
  if (changed.start_date || changed.start_time || changed.end_date || changed.end_time) {
    patch.starts_at = full.starts_at;
    patch.ends_at = full.ends_at;
  }
  if (changed.location_or_link) patch.location_or_link = full.location_or_link;
  if (changed.application_id) patch.application_id = full.application_id;
  return patch;
}

/** Only http(s) URLs become links (target=_blank, noopener); anything else is plain text. */
export function linkHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

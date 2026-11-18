import { describe, expect, it } from 'vitest';

import type { Reminder } from '@/types/reminder';

import {
  newReminderValues,
  reminderFormSchema,
  reminderFormValues,
  toReminderInput,
  toReminderPatch,
} from './reminder-schema';

const CHICAGO = 'America/Chicago';
const base: Reminder = {
  id: 'r1',
  title: 'Chase the recruiter',
  application: null,
  due_on: null,
  due_at: null,
  done_at: null,
};

describe('reminder form values', () => {
  it('defaults a new follow-up to all day, a week out', () => {
    expect(newReminderValues('2026-11-27')).toEqual({ title: '', date: '2026-12-04', time: '' });
  });

  it('shows a timed reminder in local date and time', () => {
    const timed = { ...base, due_at: '2026-11-21T03:30:00Z' };
    expect(reminderFormValues(timed, CHICAGO)).toEqual({
      title: 'Chase the recruiter',
      date: '2026-11-20',
      time: '21:30',
    });
    expect(reminderFormValues({ ...base, due_on: '2026-11-20' }, CHICAGO)).toMatchObject({
      date: '2026-11-20',
      time: '',
    });
  });

  it('validates the title, date and time', () => {
    const parse = (v: object) =>
      reminderFormSchema.safeParse({ title: 'x', date: '2026-11-20', time: '', ...v }).success;
    expect(parse({})).toBe(true);
    expect(parse({ title: '  ' })).toBe(false);
    expect(parse({ date: '' })).toBe(false);
    expect(parse({ date: '2026-02-30' })).toBe(false);
    expect(parse({ time: '9am' })).toBe(false);
    expect(parse({ time: '09:30' })).toBe(true);
  });
});

describe('sending', () => {
  it('sends a date for all-day and a UTC instant for timed reminders', () => {
    const values = { title: ' Send portfolio ', date: '2027-03-14', time: '' };
    expect(toReminderInput(values, 'app-1', CHICAGO)).toEqual({
      title: 'Send portfolio',
      application_id: 'app-1',
      due_on: '2027-03-14', // never converted: stays the 14th everywhere
    });
    expect(toReminderInput({ ...values, time: '09:00' }, null, CHICAGO)).toEqual({
      title: 'Send portfolio',
      application_id: null,
      due_at: '2027-03-14T14:00:00.000Z', // 09:00 CDT, the first day of daylight saving
    });
  });

  it('patches only what changed, resending the due date when date or time changed', () => {
    const values = { title: 'Renamed', date: '2026-11-20', time: '' };
    expect(toReminderPatch(values, { title: true }, CHICAGO)).toEqual({ title: 'Renamed' });
    expect(toReminderPatch(values, { time: true }, CHICAGO)).toEqual({ due_on: '2026-11-20' });
    expect(toReminderPatch({ ...values, time: '08:00' }, { time: true }, CHICAGO)).toEqual({
      due_at: '2026-11-20T14:00:00.000Z',
    });
    expect(toReminderPatch(values, {}, CHICAGO)).toEqual({});
  });
});

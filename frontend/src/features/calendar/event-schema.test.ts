import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '@/types/calendar';

import {
  eventFormSchema,
  eventFormValues,
  linkHref,
  newEventValues,
  toEventInput,
  toEventPatch,
} from './event-schema';

const CHICAGO = 'America/Chicago';
const valid = { ...newEventValues('2027-03-14'), title: 'Technical interview' };

describe('eventFormSchema', () => {
  const issues = (v: object) => {
    const result = eventFormSchema.safeParse({ ...valid, ...v });
    return result.success
      ? []
      : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('needs a title, date and start time', () => {
    expect(issues({})).toEqual([]);
    expect(issues({ title: ' ' })).toHaveLength(1);
    expect(issues({ start_time: '' })).toEqual(['start_time: Pick a start time']);
    expect(issues({ start_date: '2027-02-30' })).toEqual(['start_date: Pick a date']);
  });

  it('allows no end, but not an end before the start', () => {
    expect(issues({ end_time: '' })).toEqual([]);
    expect(issues({ end_time: '08:00' })).toEqual(['end_time: The end can’t be before the start']);
    expect(issues({ end_date: '2027-03-15', end_time: '08:00' })).toEqual([]); // next day
  });
});

describe('conversions', () => {
  it('sends UTC instants of the local times, across DST', () => {
    const input = toEventInput(
      { ...valid, location_or_link: ' https://meet.example.org/abc ', application_id: 'app-1' },
      CHICAGO,
    );
    expect(input).toEqual({
      kind: 'interview',
      title: 'Technical interview',
      starts_at: '2027-03-14T14:00:00.000Z', // 09:00 CDT
      ends_at: '2027-03-14T15:00:00.000Z',
      location_or_link: 'https://meet.example.org/abc',
      application_id: 'app-1',
    });
    expect(toEventInput({ ...valid, end_time: '' }, CHICAGO).ends_at).toBeNull();
  });

  it('round-trips an overnight event through the form', () => {
    const event: CalendarEvent = {
      id: 'e1',
      kind: 'interview',
      title: 'Sydney call',
      starts_at: '2026-11-24T05:00:00Z', // 23:00 on the 23rd in Chicago
      ends_at: '2026-11-24T06:30:00Z', // 00:30 on the 24th
      location_or_link: null,
      application: null,
    };
    const values = eventFormValues(event, CHICAGO);
    expect(values).toMatchObject({
      start_date: '2026-11-23',
      start_time: '23:00',
      end_date: '2026-11-24',
      end_time: '00:30',
    });
    expect(toEventInput(values, CHICAGO)).toMatchObject({
      starts_at: '2026-11-24T05:00:00.000Z',
      ends_at: '2026-11-24T06:30:00.000Z',
    });
  });

  it('patches only what changed; any date or time change resends both ends', () => {
    expect(toEventPatch({ ...valid, title: 'Onsite' }, { title: true }, CHICAGO)).toEqual({
      title: 'Onsite',
    });
    expect(toEventPatch({ ...valid, end_time: '' }, { end_time: true }, CHICAGO)).toEqual({
      starts_at: '2027-03-14T14:00:00.000Z',
      ends_at: null,
    });
  });
});

describe('linkHref', () => {
  it('links only http(s) URLs', () => {
    expect(linkHref('https://meet.example.org/abc')).toBe('https://meet.example.org/abc');
    expect(linkHref('Old Street, London')).toBeNull();
    expect(linkHref('javascript:alert(1)')).toBeNull();
    expect(linkHref('mailto:someone@example.org')).toBeNull();
    expect(linkHref(null)).toBeNull();
  });
});

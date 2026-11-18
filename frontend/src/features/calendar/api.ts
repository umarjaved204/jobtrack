import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarFeed,
} from '@/types/calendar';

/*
 * Server state for the calendar: the merged feed (events + apply-by dates + reminders) per
 * range, and an application's events. Reminder and application mutations invalidate
 * `calendarKeys.all` too, since the feed shows them.
 */
export const calendarKeys = {
  all: ['calendar'] as const,
  feed: (range: { from: string; to: string }) => [...calendarKeys.all, 'feed', range] as const,
  events: (applicationId: string) => [...calendarKeys.all, 'events', applicationId] as const,
};

export const calendarFeedQuery = (range: { from: string; to: string }) =>
  queryOptions({
    queryKey: calendarKeys.feed(range),
    queryFn: ({ signal }) =>
      api.get<CalendarFeed>(`/calendar?${new URLSearchParams(range).toString()}`, { signal }),
    // Keep the current month on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

export const applicationEventsQuery = (applicationId: string) =>
  queryOptions({
    queryKey: calendarKeys.events(applicationId),
    queryFn: ({ signal }) =>
      api.get<CalendarEvent[]>(`/calendar-events?application_id=${applicationId}`, { signal }),
  });

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: calendarKeys.all });
}

export function useCreateEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CalendarEventInput) => api.post<CalendarEvent>('/calendar-events', input),
    onSuccess: invalidate,
  });
}

export function useUpdateEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CalendarEventPatch }) =>
      api.patch<CalendarEvent>(`/calendar-events/${id}`, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/calendar-events/${id}`),
    onSuccess: invalidate,
  });
}

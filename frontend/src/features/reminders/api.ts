import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type { Reminder, ReminderFilters, ReminderInput, ReminderPatch } from '@/types/reminder';

/*
 * Server state for reminders. Lists are keyed by their filters; any change refetches every
 * reminder list (they're small, and one reminder can appear in several: an application's
 * section, "Coming up", the calendar).
 */
export const reminderKeys = {
  all: ['reminders'] as const,
  list: (filters: ReminderFilters) => [...reminderKeys.all, 'list', filters] as const,
};

export const remindersQuery = (filters: ReminderFilters = {}) =>
  queryOptions({
    queryKey: reminderKeys.list(filters),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams(filters as Record<string, string>).toString();
      return api.get<Reminder[]>(`/reminders${params ? `?${params}` : ''}`, { signal });
    },
  });

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: reminderKeys.all });
}

export function useCreateReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ReminderInput) => api.post<Reminder>('/reminders', input),
    onSuccess: invalidate,
  });
}

export function useUpdateReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ReminderPatch }) =>
      api.patch<Reminder>(`/reminders/${id}`, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/reminders/${id}`),
    onSuccess: invalidate,
  });
}

import {
  keepPreviousData,
  type QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type {
  Application,
  ApplicationEvent,
  ApplicationFilters,
  ApplicationInput,
  ApplicationPatch,
  Board,
  Contact,
  ContactInput,
  Page,
  Tag,
} from '@/types/application';

import { type MoveInput, moveInBoard } from './board';

/*
 * Server state for applications, tags, timeline and contacts (TanStack Query).
 * Keys are hierarchical, so `applicationKeys.all` invalidates everything below it.
 */
export const applicationKeys = {
  all: ['applications'] as const,
  lists: () => [...applicationKeys.all, 'list'] as const,
  list: (filters: ApplicationFilters) => [...applicationKeys.lists(), filters] as const,
  board: () => [...applicationKeys.all, 'board'] as const,
  detail: (id: string) => [...applicationKeys.all, 'detail', id] as const,
  events: (id: string) => [...applicationKeys.all, 'events', id] as const,
  contacts: (id: string) => [...applicationKeys.all, 'contacts', id] as const,
};
export const tagKeys = { all: ['tags'] as const };

const moveMutationKey = [...applicationKeys.all, 'move'] as const;

/** `{status: ['applied', 'offer'], q: 'monzo'}` → `?q=monzo&status=applied&status=offer`. */
export function toSearchParams(filters: ApplicationFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '') continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

// ---------------------------------------------------------------- queries

export const applicationsListQuery = (filters: ApplicationFilters) =>
  queryOptions({
    queryKey: applicationKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Page<Application>>(`/applications${toSearchParams(filters)}`, { signal }),
    // Keep showing the current page while the next one (or a new filter) loads.
    placeholderData: keepPreviousData,
  });

export const boardQuery = () =>
  queryOptions({
    queryKey: applicationKeys.board(),
    queryFn: ({ signal }) => api.get<Board>('/applications/board', { signal }),
  });

export const applicationQuery = (id: string) =>
  queryOptions({
    queryKey: applicationKeys.detail(id),
    queryFn: ({ signal }) => api.get<Application>(`/applications/${id}`, { signal }),
  });

export const eventsQuery = (id: string) =>
  queryOptions({
    queryKey: applicationKeys.events(id),
    queryFn: ({ signal }) => api.get<ApplicationEvent[]>(`/applications/${id}/events`, { signal }),
  });

export const contactsQuery = (id: string) =>
  queryOptions({
    queryKey: applicationKeys.contacts(id),
    queryFn: ({ signal }) => api.get<Contact[]>(`/applications/${id}/contacts`, { signal }),
  });

export const tagsQuery = () =>
  queryOptions({
    queryKey: tagKeys.all,
    queryFn: ({ signal }) => api.get<Tag[]>('/tags', { signal }),
    staleTime: 5 * 60_000, // rarely change; mutations below keep it fresh
  });

// ---------------------------------------------------------------- mutations

/** After anything that changes an application: views that might show it refetch. */
function invalidateViews(queryClient: QueryClient, id?: string) {
  void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: applicationKeys.board() });
  if (id) void queryClient.invalidateQueries({ queryKey: applicationKeys.events(id) });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationInput) => api.post<Application>('/applications', input),
    onSuccess: (created) => {
      queryClient.setQueryData(applicationKeys.detail(created.id), created);
      invalidateViews(queryClient);
    },
  });
}

export function useUpdateApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ApplicationPatch) => api.patch<Application>(`/applications/${id}`, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(applicationKeys.detail(id), updated);
      invalidateViews(queryClient, id); // a status change also adds a timeline event
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/applications/${id}`),
    onSuccess: (_data, id) => {
      for (const key of [
        applicationKeys.detail(id),
        applicationKeys.events(id),
        applicationKeys.contacts(id),
      ]) {
        queryClient.removeQueries({ queryKey: key });
      }
      invalidateViews(queryClient);
    },
  });
}

/**
 * Drag-and-drop move, applied to the board immediately (optimistic).
 *
 * - onMutate cancels in-flight board fetches first, so a late response can't overwrite
 *   the optimistic state, then snapshots the board for rollback.
 * - Several moves can be in flight (fast dragging). A failed move only rolls back when it
 *   is the last one pending; otherwise restoring its snapshot would undo the later moves,
 *   and the refetch after the last move settles corrects the board instead.
 * - The board refetches once, when the last move settles (the server may have re-spaced
 *   a crowded column). Lists, detail and timeline refetch too: the status may have changed.
 */
export function useMoveApplication() {
  const queryClient = useQueryClient();
  const boardKey = applicationKeys.board();
  const isLastMove = () => queryClient.isMutating({ mutationKey: moveMutationKey }) === 1;

  return useMutation({
    mutationKey: moveMutationKey,
    mutationFn: ({ id, status, position }: MoveInput) =>
      api.post<Application>(`/applications/${id}/move`, { status, position }),
    onMutate: async (move) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<Board>(boardKey);
      if (previous) queryClient.setQueryData(boardKey, moveInBoard(previous, move));
      return { previous };
    },
    onError: (_error, _move, context) => {
      if (context?.previous && isLastMove()) queryClient.setQueryData(boardKey, context.previous);
    },
    onSettled: (_data, _error, move) => {
      if (isLastMove()) void queryClient.invalidateQueries({ queryKey: boardKey });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.detail(move.id) });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.events(move.id) });
    },
  });
}

export function useAddNote(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<ApplicationEvent>(`/applications/${applicationId}/events`, { body }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: applicationKeys.events(applicationId) }),
  });
}

export function useCreateContact(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactInput) =>
      api.post<Contact>(`/applications/${applicationId}/contacts`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: applicationKeys.contacts(applicationId) }),
  });
}

export function useUpdateContact(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ContactInput> }) =>
      api.patch<Contact>(`/contacts/${id}`, patch),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: applicationKeys.contacts(applicationId) }),
  });
}

export function useDeleteContact(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: applicationKeys.contacts(applicationId) }),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string }) => api.post<Tag>('/tags', input),
    onSuccess: (tag) => {
      queryClient.setQueryData<Tag[]>(tagKeys.all, (tags = []) =>
        [...tags, tag].sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
  });
}

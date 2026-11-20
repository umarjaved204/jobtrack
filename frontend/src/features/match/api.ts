import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { resumeKeys } from '@/features/resumes/api';
import { api } from '@/lib/api/client';
import type { Page } from '@/types/application';
import type { Match, MatchConfig, MatchSummary } from '@/types/match';

import { clearVectorCache } from './vector-cache';

/*
 * Server state for the AI match. Running a match is not a plain mutation (it spans the
 * API and the embedding worker): see `run-match.ts` and `use-match-run.ts`, which put the
 * new result in the cache and invalidate what it changes (history, resume usage counts).
 */
export const matchKeys = {
  all: ['match'] as const,
  config: () => [...matchKeys.all, 'config'] as const,
  lists: () => [...matchKeys.all, 'list'] as const,
  list: (params: MatchListParams) => [...matchKeys.lists(), params] as const,
  detail: (id: string) => [...matchKeys.all, 'detail', id] as const,
};

export type MatchListParams = { applicationId?: string; page?: number; pageSize?: number };

export const matchConfigQuery = () =>
  queryOptions({
    queryKey: matchKeys.config(),
    queryFn: ({ signal }) => api.get<MatchConfig>('/match/config', { signal }),
    // Deployment configuration: it doesn't change while the page is open.
    staleTime: Infinity,
  });

export const matchesQuery = (params: MatchListParams = {}) =>
  queryOptions({
    queryKey: matchKeys.list(params),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams();
      if (params.applicationId) search.set('application_id', params.applicationId);
      if (params.page) search.set('page', String(params.page));
      if (params.pageSize) search.set('page_size', String(params.pageSize));
      const query = search.size ? `?${search}` : '';
      return api.get<Page<MatchSummary>>(`/match${query}`, { signal });
    },
  });

export const matchQuery = (id: string) =>
  queryOptions({
    queryKey: matchKeys.detail(id),
    queryFn: ({ signal }) => api.get<Match>(`/match/${id}`, { signal }),
    // A saved result never changes (only whether it's current, with a deploy).
    staleTime: 5 * 60_000,
  });

/**
 * Deletes the whole match history, then this browser's chunk vectors (which never
 * throws). Resume versions only matches froze become editable, so resumes refetch too.
 */
export function useDeleteMatchHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/match');
      await clearVectorCache();
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...matchKeys.all, 'detail'] });
      void queryClient.invalidateQueries({ queryKey: matchKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: resumeKeys.all });
    },
  });
}

import { type QueryClient, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type { Resume, ResumeInput, ResumePatch, ResumeSummary } from '@/types/resume';

/*
 * Server state for resume versions. The list (light: no text) feeds the page and the
 * application form's picker; a version's text is fetched on its own when shown.
 * Application mutations invalidate `resumeKeys.all` too: linking one changes the counts.
 */
export const resumeKeys = {
  all: ['resumes'] as const,
  list: () => [...resumeKeys.all, 'list'] as const,
  detail: (id: string) => [...resumeKeys.all, 'detail', id] as const,
};

export const resumesQuery = () =>
  queryOptions({
    queryKey: resumeKeys.list(),
    queryFn: ({ signal }) => api.get<ResumeSummary[]>('/resumes', { signal }),
  });

export const resumeQuery = (id: string) =>
  queryOptions({
    queryKey: resumeKeys.detail(id),
    queryFn: ({ signal }) => api.get<Resume>(`/resumes/${id}`, { signal }),
  });

function refresh(queryClient: QueryClient, saved?: Resume) {
  if (saved) queryClient.setQueryData(resumeKeys.detail(saved.id), saved);
  // Setting a default or archiving changes other rows too: refetch the whole list.
  void queryClient.invalidateQueries({ queryKey: resumeKeys.list() });
}

export function useCreateResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResumeInput) => api.post<Resume>('/resumes', input),
    onSuccess: (created) => refresh(queryClient, created),
  });
}

export function useUpdateResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ResumePatch }) =>
      api.patch<Resume>(`/resumes/${id}`, patch),
    onSuccess: (updated) => refresh(queryClient, updated),
  });
}

export function useDeleteResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/resumes/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: resumeKeys.detail(id) });
      refresh(queryClient);
    },
  });
}

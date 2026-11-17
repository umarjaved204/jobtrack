import { QueryClient } from '@tanstack/react-query';

import { isApiError } from '@/lib/api/errors';

const MAX_RETRIES = 2;

/** Retry only what can succeed on a second try: network failures and 5xx, not 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!isApiError(error)) return false;
  return error.status === 0 || error.status >= 500;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

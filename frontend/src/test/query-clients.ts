import type { QueryClient } from '@tanstack/react-query';

/*
 * Query clients that `renderApp` created for the current test. A test can end while
 * requests it started are still in flight (an invalidation's refetch after the last
 * assertion). If one finishes after the file's jsdom environment is gone, TanStack
 * Query's notify batch (a setTimeout) reaches React with no `window` and Vitest reports
 * an unhandled error. `settleQueryClients` (setup.ts, after each test) lets that work
 * finish first, then flushes the batch while the environment still exists.
 */
const clients = new Set<QueryClient>();

/** The longest a test's leftover requests are waited for; MSW answers in milliseconds. */
const SETTLE_TIMEOUT_MS = 2000;

export function trackQueryClient(queryClient: QueryClient): QueryClient {
  clients.add(queryClient);
  return queryClient;
}

/** Waits for in-flight queries and mutations, bounded: a stuck request never fails a test. */
export async function settleQueryClients(): Promise<void> {
  const busy = () => [...clients].some((c) => c.isFetching() > 0 || c.isMutating() > 0);
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (busy() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** After unmounting: drop the caches, then let queued notifications run (to no one). */
export async function clearQueryClients(): Promise<void> {
  for (const queryClient of clients) queryClient.clear();
  clients.clear();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

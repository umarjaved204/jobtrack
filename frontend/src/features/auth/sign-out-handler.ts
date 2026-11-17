import type { QueryClient } from '@tanstack/react-query';

import type { SessionManager } from '@/lib/api/session';

type Deps = {
  session: Pick<SessionManager, 'onSignedOut'>;
  queryClient: QueryClient;
  navigate: (to: string, options: { replace: boolean }) => unknown;
  /** Current in-app location (pathname + search), used for `?next=` after expiry. */
  currentPath: () => string;
};

/**
 * One place that reacts to sign-out, whether it started here (Sign out, failed refresh)
 * or in another tab (BroadcastChannel): drop every cached query, which may hold the
 * previous user's data, then go to /login. After an expiry we keep `next` so the user
 * lands back where they were.
 */
export function installSignOutHandler({ session, queryClient, navigate, currentPath }: Deps) {
  return session.onSignedOut((reason) => {
    queryClient.clear();
    const query =
      reason === 'expired' ? `?reason=expired&next=${encodeURIComponent(currentPath())}` : '';
    navigate(`/login${query}`, { replace: true });
  });
}

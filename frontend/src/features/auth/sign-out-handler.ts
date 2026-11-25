import type { QueryClient } from '@tanstack/react-query';

import { clearVectorCache } from '@/features/match/vector-cache';
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
 * previous user's data, and the match vector cache (vectors of their resumes and
 * adverts; never throws), then go to /login. After an expiry we keep `next` so the user
 * lands back where they were; after deleting the account, the login page says so.
 */
export function installSignOutHandler({ session, queryClient, navigate, currentPath }: Deps) {
  return session.onSignedOut((reason) => {
    queryClient.clear();
    void clearVectorCache();
    let query = '';
    if (reason === 'expired') query = `?reason=expired&next=${encodeURIComponent(currentPath())}`;
    else if (reason === 'deleted') query = '?reason=deleted';
    navigate(`/login${query}`, { replace: true });
  });
}

import type { QueryClient } from '@tanstack/react-query';
import { type LoaderFunctionArgs, redirect } from 'react-router';

import { safeNextPath } from '@/lib/safe-next-path';

import { sessionQueryOptions } from './api';

/**
 * Route loaders that gate pages on the session. They run before anything renders, so a
 * protected page never flashes for a signed-out visitor (and vice versa for /login).
 */
export function createAuthGuards(queryClient: QueryClient) {
  const loadUser = () => queryClient.ensureQueryData(sessionQueryOptions);

  return {
    /** Protected layout: anonymous visitors go to /login, remembering where they were. */
    async requireUser({ request }: LoaderFunctionArgs) {
      const user = await loadUser(); // network errors propagate to the error boundary
      if (!user) {
        const { pathname, search } = new URL(request.url);
        throw redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
      }
      return null;
    },

    /** /login and /register: signed-in users skip straight to their destination. */
    async redirectIfSignedIn({ request }: LoaderFunctionArgs) {
      // If the API is unreachable, still show the form (it reports the error on submit).
      const user = await loadUser().catch(() => null);
      if (user) throw redirect(safeNextPath(new URL(request.url).searchParams.get('next')));
      return null;
    },
  };
}

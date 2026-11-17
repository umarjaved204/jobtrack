import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { session } from '@/lib/api/session';
import { accentColors, type AccentColor } from '@/lib/palette';
import { setAccent, setTheme } from '@/lib/theme';
import type { AuthResponse, User } from '@/types/auth';

export type Credentials = { email: string; password: string };
export type Registration = Credentials & { full_name: string };

export const sessionQueryKey = ['session'] as const;

/**
 * The signed-in user, or `null` when anonymous. Loaded once per tab by swapping the
 * refresh cookie for an access token (one call: /auth/refresh returns the user too), then
 * kept up to date by sign-in / profile updates. Never refetched in the background.
 * Network/server errors reject (they are not "signed out").
 */
export const sessionQueryOptions = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: async (): Promise<User | null> => {
    const result = await session.refresh();
    if (result) applyProfileTheme(result.user);
    return result?.user ?? null;
  },
  staleTime: Infinity,
  gcTime: Infinity,
  retry: false,
});

/**
 * The account's theme and accent win once signed in. setTheme/setAccent also write the
 * localStorage cache that index.html applies before React mounts, so the next cold load
 * shows the right theme before the session is restored. (Only these two values are cached.)
 */
export function applyProfileTheme(user: Pick<User, 'theme' | 'accent'>) {
  setTheme(user.theme);
  if (accentColors.includes(user.accent as AccentColor)) setAccent(user.accent as AccentColor);
}

function establishSession(queryClient: QueryClient, response: AuthResponse) {
  session.start(response);
  applyProfileTheme(response.user);
  queryClient.setQueryData(sessionQueryKey, response.user);
  return response.user;
}

export async function signIn(queryClient: QueryClient, credentials: Credentials) {
  return establishSession(queryClient, await api.post<AuthResponse>('/auth/login', credentials));
}

export async function signUp(queryClient: QueryClient, registration: Registration) {
  return establishSession(
    queryClient,
    await api.post<AuthResponse>('/auth/register', registration),
  );
}

/**
 * Revoke the refresh token server-side, then end the session locally. The local sign-out
 * happens even if the request fails (offline): the user asked to leave. The sign-out
 * handler clears cached data and navigates to /login.
 */
export async function signOut() {
  try {
    await api.post('/auth/logout');
  } catch {
    // Server unreachable: the refresh cookie survives until it expires or is next used.
  } finally {
    session.end('logout');
  }
}

export function updateProfile(patch: Partial<Pick<User, 'full_name' | 'theme' | 'accent'>>) {
  return api.patch<User>('/users/me', patch);
}

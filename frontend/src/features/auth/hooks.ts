import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AccentColor } from '@/lib/palette';
import { type Theme, useTheme } from '@/lib/theme';
import type { User } from '@/types/auth';

import {
  type Credentials,
  type Registration,
  sessionQueryKey,
  sessionQueryOptions,
  signIn,
  signOut,
  signUp,
  updateProfile,
} from './api';

/** The signed-in user, or null. Reads the cache filled by the route loaders. */
export function useCurrentUser(): User | null {
  return useQuery(sessionQueryOptions).data ?? null;
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) => signIn(queryClient, credentials),
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registration: Registration) => signUp(queryClient, registration),
  });
}

export function useSignOut() {
  return useMutation({ mutationFn: signOut });
}

/**
 * Theme + accent that also persist to the profile when signed in. Applies locally first
 * (instant), then PATCHes /users/me; if the save fails, the previous value is restored.
 */
export function useThemePreference() {
  const queryClient = useQueryClient();
  const local = useTheme();
  const user = useCurrentUser();
  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => queryClient.setQueryData(sessionQueryKey, updated),
  });

  return {
    theme: local.theme,
    accent: local.accent,
    setTheme(theme: Theme) {
      const previous = local.theme;
      local.setTheme(theme);
      if (user) save.mutate({ theme }, { onError: () => local.setTheme(previous) });
    },
    setAccent(accent: AccentColor) {
      const previous = local.accent;
      local.setAccent(accent);
      if (user) save.mutate({ accent }, { onError: () => local.setAccent(previous) });
    },
  };
}

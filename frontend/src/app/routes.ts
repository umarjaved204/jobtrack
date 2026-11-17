import type { QueryClient } from '@tanstack/react-query';
import type { RouteObject } from 'react-router';

import { AppShell } from '@/app/layouts/app-shell';
import { NotFoundPage } from '@/app/not-found-page';
import { AppFallback, PageErrorBoundary, RootErrorBoundary } from '@/app/route-states';
import { createAuthGuards } from '@/features/auth/guards';

/*
 * Route table (React Router data mode). Feature pages are lazy-loaded so each one is its
 * own chunk. A factory (not a constant) because the auth guards need the QueryClient;
 * tests build their own router from it with a fresh client.
 */
export function createRoutes({ queryClient }: { queryClient: QueryClient }): RouteObject[] {
  const guards = createAuthGuards(queryClient);

  return [
    {
      path: '/',
      HydrateFallback: AppFallback,
      ErrorBoundary: RootErrorBoundary,
      children: [
        // ---------------------------------------------------------- public (signed out)
        {
          loader: guards.redirectIfSignedIn,
          children: [
            {
              index: true,
              lazy: async () => ({
                Component: (await import('@/features/landing/landing-page')).LandingPage,
              }),
            },
            {
              lazy: async () => ({
                Component: (await import('@/features/auth/auth-layout')).AuthLayout,
              }),
              children: [
                {
                  path: 'login',
                  lazy: async () => ({
                    Component: (await import('@/features/auth/login-page')).LoginPage,
                  }),
                },
                {
                  path: 'register',
                  lazy: async () => ({
                    Component: (await import('@/features/auth/register-page')).RegisterPage,
                  }),
                },
              ],
            },
          ],
        },
        // ---------------------------------------------------------- app (signed in)
        {
          Component: AppShell,
          loader: guards.requireUser,
          children: [
            {
              // Pathless layout route: page errors render inside the shell.
              ErrorBoundary: PageErrorBoundary,
              children: [
                {
                  path: 'dashboard',
                  lazy: async () => ({
                    Component: (await import('@/features/dashboard/dashboard-page')).DashboardPage,
                  }),
                },
                {
                  path: 'applications',
                  lazy: async () => ({
                    Component: (await import('@/features/applications/applications-page'))
                      .ApplicationsPage,
                  }),
                },
                {
                  path: 'calendar',
                  lazy: async () => ({
                    Component: (await import('@/features/calendar/calendar-page')).CalendarPage,
                  }),
                },
                {
                  path: 'resumes',
                  lazy: async () => ({
                    Component: (await import('@/features/resumes/resumes-page')).ResumesPage,
                  }),
                },
                {
                  path: 'match',
                  lazy: async () => ({
                    Component: (await import('@/features/match/match-page')).MatchPage,
                  }),
                },
                {
                  path: 'settings',
                  lazy: async () => ({
                    Component: (await import('@/features/settings/settings-page')).SettingsPage,
                  }),
                },
                { path: '*', Component: NotFoundPage },
              ],
            },
          ],
        },
      ],
    },
  ];
}

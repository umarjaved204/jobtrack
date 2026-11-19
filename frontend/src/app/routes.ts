import type { QueryClient } from '@tanstack/react-query';
import type { RouteObject } from 'react-router';

import { NotFoundPage } from '@/app/not-found-page';
import { AppFallback, PageErrorBoundary, RootErrorBoundary } from '@/app/route-states';
import { createAuthGuards } from '@/features/auth/guards';
// Eager: the landing page is the most common first paint, so it ships in the main bundle
// (no extra chunk round trip) and renders without waiting for the session check.
import { LandingPage } from '@/features/landing/landing-page';

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
        // ---------------------------------------------------------- public
        // No loader: renders at once; signed-in visitors see "Open your dashboard".
        { index: true, Component: LandingPage },
        // Sign-in / sign-up: signed-in visitors are forwarded before anything renders.
        {
          loader: guards.redirectIfSignedIn,
          children: [
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
          // Lazy: menus, drawer and motion stay out of the public pages' bundle. The chunk
          // loads in parallel with the guard's session check.
          lazy: async () => ({ Component: (await import('@/app/layouts/app-shell')).AppShell }),
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
                  path: 'applications/:id',
                  lazy: async () => ({
                    Component: (await import('@/features/applications/application-detail-page'))
                      .ApplicationDetailPage,
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
                  path: 'match/:matchId',
                  lazy: async () => ({
                    Component: (await import('@/features/match/match-detail-page')).MatchDetailPage,
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

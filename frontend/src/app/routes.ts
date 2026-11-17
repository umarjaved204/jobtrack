import type { RouteObject } from 'react-router';

import { AppShell } from '@/app/layouts/app-shell';
import { NotFoundPage } from '@/app/not-found-page';
import {
  AppFallback,
  IndexRedirect,
  PageErrorBoundary,
  RootErrorBoundary,
} from '@/app/route-states';

/*
 * Route table (React Router data mode). Feature pages are lazy-loaded so each one is
 * its own chunk. Exported separately from the router so tests can mount it in memory.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppShell,
    HydrateFallback: AppFallback,
    ErrorBoundary: RootErrorBoundary,
    children: [
      {
        // Pathless layout route: page errors render inside the shell.
        ErrorBoundary: PageErrorBoundary,
        children: [
          { index: true, Component: IndexRedirect },
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
];

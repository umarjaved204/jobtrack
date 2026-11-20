import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { expect } from 'vitest';

import { AppProviders } from '@/app/providers';
import { createRoutes } from '@/app/routes';
import { installSignOutHandler } from '@/features/auth/sign-out-handler';
import { session } from '@/lib/api/session';
import { createQueryClient } from '@/lib/query-client';

import { trackQueryClient } from './query-clients';

/**
 * Mounts the real app (routes, guards, providers, sign-out handler) in a memory router
 * with a fresh QueryClient. The network is MSW (src/test/msw.ts).
 */
export function renderApp(path: string) {
  const queryClient = trackQueryClient(createQueryClient());
  const router = createMemoryRouter(createRoutes({ queryClient }), { initialEntries: [path] });
  installSignOutHandler({
    session,
    queryClient,
    navigate: (to, options) => router.navigate(to, options),
    currentPath: () => router.state.location.pathname + router.state.location.search,
  });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return {
    router,
    queryClient,
    location: () => router.state.location.pathname + router.state.location.search,
  };
}

/**
 * Waits for a page's h1 and for it to become visible. Pages fade in (motion), and
 * motion applies the end state on its next animation frame, so visibility is async.
 */
export async function findPageHeading(name: string) {
  const heading = await screen.findByRole('heading', { level: 1, name });
  await waitFor(() => expect(heading).toBeVisible());
  return heading;
}

import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { AppProviders } from '@/app/providers';
import { createRoutes } from '@/app/routes';
import { installSignOutHandler } from '@/features/auth/sign-out-handler';
import { session } from '@/lib/api/session';
import { createQueryClient } from '@/lib/query-client';

// Created once, outside React (data routers and query clients must not live in state).
const queryClient = createQueryClient();
const router = createBrowserRouter(createRoutes({ queryClient }));

installSignOutHandler({
  session,
  queryClient,
  navigate: (to, options) => router.navigate(to, options),
  currentPath: () => router.state.location.pathname + router.state.location.search,
});

function App() {
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export { App };

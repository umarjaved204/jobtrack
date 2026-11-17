import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type * as React from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { routes } from '@/app/routes';
import { TooltipProvider } from '@/components/ui/tooltip';

// Created once, outside React (data routers must not live in component state).
const router = createBrowserRouter(routes);

/**
 * Global providers, shared by the app and the integration tests.
 * (TanStack Query joins in Phase 5.)
 */
function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    // LazyMotion + `m.*` components ship only the DOM animation features we use (smaller
    // bundle); `strict` throws if a full `motion.*` component sneaks back in.
    // reducedMotion "user": honour prefers-reduced-motion (transforms off, fades kept).
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>{children}</TooltipProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export { App, AppProviders };

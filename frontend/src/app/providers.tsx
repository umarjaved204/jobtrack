import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type * as React from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Global providers, shared by the app and the integration tests. */
function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* LazyMotion + `m.*` components ship only the DOM animation features we use;
          `strict` throws if a full `motion.*` component sneaks back in.
          reducedMotion "user": honour prefers-reduced-motion (transforms off, fades kept). */}
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}

export { AppProviders };

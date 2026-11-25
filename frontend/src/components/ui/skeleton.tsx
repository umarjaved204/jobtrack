import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Loading placeholder. Decorative (`aria-hidden`): mark the loading region itself with
 * `aria-busy` and give it an accessible label. Pulse stops under prefers-reduced-motion.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse bg-accent', className)}
      {...props}
    />
  );
}

export { Skeleton };

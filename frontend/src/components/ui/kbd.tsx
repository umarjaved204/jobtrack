import type * as React from 'react';

import { cn } from '@/lib/utils';

/** A key cap, for shortcut hints ("⌘ K", "Esc"). */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center border border-border-quiet bg-background px-1 font-mono text-[0.6875rem] leading-none font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };

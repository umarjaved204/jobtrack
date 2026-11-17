import type * as React from 'react';

import { fieldClasses } from '@/components/ui/variants';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClasses,
        'h-10 px-3 py-1',
        'file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Input };

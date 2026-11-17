import type * as React from 'react';

import { fieldClasses } from '@/components/ui/variants';
import { cn } from '@/lib/utils';

/** Grows with its content (`field-sizing: content`) where supported; min height otherwise. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClasses, 'field-sizing-content min-h-24 px-3 py-2', className)}
      {...props}
    />
  );
}

export { Textarea };

import { Separator as SeparatorPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

type SeparatorProps = React.ComponentProps<typeof SeparatorPrimitive.Root> & {
  /** `hairline` (default) is a quiet divider; `rule` is a full-ink newspaper rule. */
  weight?: 'hairline' | 'rule';
};

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  weight = 'hairline',
  ...props
}: SeparatorProps) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0',
        weight === 'rule' ? 'bg-rule' : 'bg-border',
        'data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };

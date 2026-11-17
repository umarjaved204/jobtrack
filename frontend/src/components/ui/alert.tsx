import { CircleAlert, Info } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const tones = {
  // Tinted panel + text-safe ink of the same hue (both pairs are AA-tested tokens).
  error: { className: 'border-oxblood/30 bg-oxblood-tint text-oxblood', icon: CircleAlert },
  info: { className: 'border-cobalt/30 bg-cobalt-tint text-cobalt', icon: Info },
} as const;

type AlertProps = React.ComponentProps<'div'> & {
  tone?: keyof typeof tones;
  title?: string;
};

/**
 * Inline message. Errors use role="alert" (announced immediately), info uses role="status"
 * (announced politely). Keep the text stable: changing it re-announces it.
 */
function Alert({ tone = 'error', title, className, children, ...props }: AlertProps) {
  const { className: toneClass, icon: Icon } = tones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      data-slot="alert"
      data-tone={tone}
      className={cn('flex gap-3 rounded-md border px-4 py-3 text-sm', toneClass, className)}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="grid gap-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export { Alert };

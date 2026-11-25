import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  /** Usually a single primary Button. */
  action?: React.ReactNode;
  className?: string;
};

/**
 * "Nothing here yet" panel: says why it's empty and what to do next. Set like a notice in
 * the paper: a card under a heavy ink rule, the icon in a square ink frame (the same mark
 * as the command palette's rows), a Fraunces headline.
 */
function EmptyState({ icon: Icon, title, children, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        'flex flex-col items-center border border-t-[3px] border-rule bg-card px-6 py-14 text-center',
        className,
      )}
    >
      <span className="grid size-12 place-items-center border border-rule">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-5 font-display text-[1.75rem] leading-tight font-semibold">{title}</h2>
      {children && (
        <div className="mt-2.5 max-w-[34rem] leading-relaxed text-muted-foreground">{children}</div>
      )}
      {action && <div className="mt-6">{action}</div>}
    </section>
  );
}

export { EmptyState };

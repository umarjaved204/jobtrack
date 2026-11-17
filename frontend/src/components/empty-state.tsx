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

/** "Nothing here yet" panel: says why it's empty and what to do next. */
function EmptyState({ icon: Icon, title, children, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        'flex flex-col items-center rounded-lg border border-dashed border-input px-6 py-16 text-center',
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-full bg-primary-tint text-primary-text">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="mt-5 font-display text-2xl font-semibold">{title}</h2>
      {children && <div className="mt-2 max-w-md text-muted-foreground">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </section>
  );
}

export { EmptyState };

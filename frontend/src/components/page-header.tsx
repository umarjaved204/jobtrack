import type * as React from 'react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  /** Small label above the title (section name). */
  kicker?: string;
  title: string;
  /** One-line standfirst under the title. */
  description?: React.ReactNode;
  /** Primary actions, aligned right on wide screens. */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Page title block. Also sets the document title (React 19 hoists <title> into <head>).
 * The h1 is focusable (tabIndex -1) so the app shell can move focus to it after
 * client-side navigation, which announces the new page to screen readers.
 */
function PageHeader({ kicker, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <title>{`${title} · JobTrack`}</title>
      <div className="max-w-prose">
        {kicker && <p className="kicker text-primary-text">{kicker}</p>}
        <h1 tabIndex={-1} className="mt-2 display-face text-display outline-none">
          {title}
        </h1>
        {description && <p className="mt-3 text-lg text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export { PageHeader };

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { SETTINGS_SECTIONS } from './settings-sections';

type SectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

/** One Settings section: a Fraunces heading over an ink rule. `scroll-mt` keeps the
 * heading clear of the top edge when the side nav jumps to it. */
function SettingsSection({
  id,
  className,
  children,
}: {
  id: SectionId;
  className?: string;
  children: ReactNode;
}) {
  const title = SETTINGS_SECTIONS.find((s) => s.id === id)?.title;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn('grid scroll-mt-6 gap-4', className)}
    >
      <h2
        id={`${id}-heading`}
        className="border-b border-rule pb-2 font-display text-[1.875rem] leading-tight font-semibold"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A row inside a section: what it does on the left, its controls on the right. */
function SettingsRow({
  title,
  headingId,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  headingId: string;
  description: ReactNode;
  actions: ReactNode;
  /** Below the row: errors, dialogs. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={headingId} className={cn('grid gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-[32.5rem] gap-1">
          <h3 id={headingId} className="font-sans text-[1.0625rem] font-bold">
            {title}
          </h3>
          <div className="text-sm leading-normal text-muted-foreground">{description}</div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export { SettingsRow, SettingsSection };

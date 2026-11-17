import type * as React from 'react';

import { cn } from '@/lib/utils';
import { type ApplicationStatus, statusLabels } from '@/types/application';

/*
 * Full class strings (not built from `status`) so Tailwind's scanner can see them.
 * Colours come from the 7-step status ramp in tokens.css (text AA-tested on its tint).
 */
const statusClasses: Record<ApplicationStatus, string> = {
  wishlist: 'bg-status-wishlist-tint text-status-wishlist',
  applied: 'bg-status-applied-tint text-status-applied',
  screening: 'bg-status-screening-tint text-status-screening',
  interview: 'bg-status-interview-tint text-status-interview',
  offer: 'bg-status-offer-tint text-status-offer',
  rejected: 'bg-status-rejected-tint text-status-rejected',
  withdrawn: 'bg-status-withdrawn-tint text-status-withdrawn',
};

type StatusBadgeProps = React.ComponentProps<'span'> & {
  status: ApplicationStatus;
};

/** Application status pill: colour dot + text label (colour is never the only cue). */
function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs leading-4 font-semibold whitespace-nowrap',
        statusClasses[status],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {statusLabels[status]}
    </span>
  );
}

export { StatusBadge };

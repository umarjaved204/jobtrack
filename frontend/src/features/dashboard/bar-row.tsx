import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * One row of a bar list: a name, a horizontal bar and its figures, aligned in columns.
 * The bar is decoration for sighted readers (the figures carry the values, and each
 * chart has a data table), so it's hidden from assistive tech. On narrow screens the bar
 * drops under the name.
 */
function BarRow({
  name,
  fraction,
  figures,
  tone = 'primary',
}: {
  name: React.ReactNode;
  /** Bar length, 0 to 1. */
  fraction: number;
  figures: React.ReactNode;
  /** One hue per job: the funnel in the primary colour, sources in ink. */
  tone?: 'primary' | 'ink';
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
      <span className="truncate text-sm font-semibold">{name}</span>
      <span
        aria-hidden="true"
        className="col-span-2 row-start-2 h-3.5 sm:col-span-1 sm:row-start-auto"
      >
        <span
          className={cn(
            'block h-full rounded-r-[4px] transition-[width] duration-(--duration-slow) ease-out-quint',
            tone === 'ink' ? 'bg-foreground' : 'bg-primary',
          )}
          // A zero still gets a hairline, so the row visibly has a value of 0.
          style={{ width: fraction > 0 ? `${fraction * 100}%` : '1px' }}
        />
      </span>
      <span className="col-start-2 row-start-1 text-right text-sm sm:col-start-3">{figures}</span>
    </li>
  );
}

export { BarRow };

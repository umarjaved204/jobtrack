import { cn } from '@/lib/utils';

import { type DashboardRange, rangeLabels, ranges } from './range';

/** Segmented control for the dashboard's date range (state lives in the URL): 44px, ink-ruled. */
function RangePicker({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (range: DashboardRange) => void;
}) {
  return (
    <div role="group" aria-label="Date range" className="flex border border-rule">
      {ranges.map((range) => {
        const selected = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range)}
            className={cn(
              'inline-flex h-11 cursor-pointer items-center border-r border-rule px-4 text-sm font-semibold whitespace-nowrap last:border-r-0',
              selected ? 'bg-foreground text-background' : 'text-foreground hover:bg-accent',
            )}
          >
            {rangeLabels[range]}
          </button>
        );
      })}
    </div>
  );
}

export { RangePicker };

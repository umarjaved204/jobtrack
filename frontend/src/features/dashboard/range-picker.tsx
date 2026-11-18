import { cn } from '@/lib/utils';

import { type DashboardRange, rangeLabels, ranges } from './range';

/** Segmented control for the dashboard's date range (state lives in the URL). */
function RangePicker({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (range: DashboardRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="flex rounded-md border border-rule bg-card p-0.5"
    >
      {ranges.map((range) => {
        const selected = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range)}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center rounded-sm px-3 text-sm font-semibold whitespace-nowrap',
              selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent',
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

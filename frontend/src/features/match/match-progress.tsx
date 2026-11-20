import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { describeProgress } from './progress-text';
import type { MatchProgress } from './run-match';

/**
 * The running match: the step, a bar, and Cancel. The bar is a progressbar with a value
 * when the step is measurable, and indeterminate otherwise. The step name sits in its own
 * live region, so screen readers hear each step once, not every percentage.
 */
function MatchProgressPanel({
  progress,
  onCancel,
  className,
}: {
  progress: MatchProgress;
  onCancel: () => void;
  className?: string;
}) {
  const { label, detail, fraction } = describeProgress(progress);
  const percent = fraction === null ? null : Math.round(fraction * 100);

  return (
    <section
      aria-label="Match in progress"
      className={cn('grid gap-3 rounded-lg border bg-card px-5 py-4', className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p role="status" aria-live="polite" className="font-semibold">
          {label}…
        </p>
        {detail && (
          <p aria-hidden="true" className="figures text-sm text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={detail ?? undefined}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-[width] duration-(--duration-base)',
            percent === null && 'w-1/3 animate-pulse motion-reduce:animate-none',
          )}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <div>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

export { MatchProgressPanel };

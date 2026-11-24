import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns/format';
import { Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { type Application, statusLabels } from '@/types/application';

import { eventsQuery } from './api';
import { stageTrack } from './stages';

/**
 * Applied → Screening → Interview → Offer across the top of the detail page: filled and
 * dated where reached, the current stage in the brand colour, and a final mark when the
 * application was rejected or withdrawn. Shares the timeline's query (no extra request);
 * until it loads, the current status alone fills the track.
 */
function StageTrack({ application }: { application: Application }) {
  const events = useQuery(eventsQuery(application.id));
  const { steps, outcome } = stageTrack(application, events.data ?? []);
  const columns = outcome ? 'grid-cols-5' : 'grid-cols-4';

  return (
    <ol aria-label="Stages reached" className={cn('grid border-b py-5', columns)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1 && !outcome;
        const nextReached = steps[i + 1]?.reached ?? Boolean(outcome);
        return (
          <li key={step.stage} className="grid min-w-0 content-start gap-1.5">
            <div className="flex items-center">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-[22px] shrink-0 place-items-center rounded-full border-2 text-xs font-bold',
                  step.current
                    ? 'border-primary bg-primary text-primary-foreground'
                    : step.reached
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-input text-muted-foreground',
                )}
              >
                {step.reached ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn('h-0.5 flex-1', nextReached ? 'bg-foreground' : 'bg-border')}
                />
              )}
            </div>
            <span
              className={cn(
                'truncate pr-2 text-[0.8125rem] sm:text-[0.9375rem]',
                step.reached ? 'font-semibold' : 'text-muted-foreground',
              )}
            >
              {statusLabels[step.stage]}
            </span>
            <span className="figures text-xs text-muted-foreground">
              {step.reached ? (
                step.on ? (
                  <>
                    <span className="sr-only">reached</span> {format(step.on, 'd MMM')}
                  </>
                ) : (
                  <span className="sr-only">reached</span>
                )
              ) : (
                <>
                  <span aria-hidden="true">–</span>
                  <span className="sr-only">not reached</span>
                </>
              )}
            </span>
          </li>
        );
      })}
      {outcome && (
        <li className="grid min-w-0 content-start gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-[22px] place-items-center rounded-full border-2',
              outcome.status === 'rejected'
                ? 'border-status-rejected bg-status-rejected-tint text-status-rejected'
                : 'border-status-withdrawn bg-status-withdrawn-tint text-status-withdrawn',
            )}
          >
            <X className="size-3" strokeWidth={3} />
          </span>
          <span className="truncate text-[0.8125rem] font-semibold sm:text-[0.9375rem]">
            {statusLabels[outcome.status]}
          </span>
          <span className="figures text-xs text-muted-foreground">
            {outcome.on && format(outcome.on, 'd MMM')}
          </span>
        </li>
      )}
    </ol>
  );
}

export { StageTrack };

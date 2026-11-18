import { cn } from '@/lib/utils';
import type { AnalyticsFunnel } from '@/types/analytics';
import { statusLabels } from '@/types/application';

import { BarRow } from './bar-row';
import { formatRate, share } from './rates';

/**
 * Applied → Screening → Interview → Offer: how many of the period's applications reached
 * each stage (or a later one). Bars share one scale (Applied = full width); each row also
 * gives the step rate from the stage before. Phase 10 animates it.
 */
function Funnel({ funnel, stale = false }: { funnel: AnalyticsFunnel; stale?: boolean }) {
  const applied = funnel.stages[0]?.count ?? 0;

  return (
    <figure aria-labelledby="funnel-heading" className="grid content-start gap-3">
      <figcaption className="grid gap-1">
        <h2 id="funnel-heading" className="font-display text-2xl font-semibold">
          Pipeline
        </h2>
        <p className="text-sm text-muted-foreground">
          How far this period’s applications got. Each stage counts everything that reached it or
          went further.
        </p>
      </figcaption>

      {applied === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing applied for in this period yet.
        </p>
      ) : (
        <ol
          aria-hidden="true"
          className={cn(
            'divide-y transition-opacity duration-(--duration-fast)',
            stale && 'opacity-60',
          )}
        >
          {funnel.stages.map((stage, i) => (
            <BarRow
              key={stage.stage}
              name={statusLabels[stage.stage]}
              fraction={share(stage.count, applied)}
              figures={
                <>
                  <span className="figures text-base font-semibold">{stage.count}</span>
                  {i > 0 && (
                    <span className="ml-2 inline-block w-36 text-left whitespace-nowrap text-muted-foreground">
                      {formatRate(stage.rate_from_previous)} of{' '}
                      {statusLabels[funnel.stages[i - 1]?.stage ?? 'applied']}
                    </span>
                  )}
                  {i === 0 && <span className="ml-2 inline-block w-36" />}
                </>
              }
            />
          ))}
        </ol>
      )}

      <table className="sr-only">
        <caption>Applications reaching each stage</caption>
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Applications</th>
            <th scope="col">Of the previous stage</th>
          </tr>
        </thead>
        <tbody>
          {funnel.stages.map((stage) => (
            <tr key={stage.stage}>
              <th scope="row">{statusLabels[stage.stage]}</th>
              <td>{stage.count}</td>
              <td>
                {stage.rate_from_previous === null
                  ? 'Not applicable'
                  : formatRate(stage.rate_from_previous)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export { Funnel };

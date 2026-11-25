import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import type { AnalyticsFunnel } from '@/types/analytics';
import { type ApplicationStatus, statusLabels } from '@/types/application';

import { Counter } from './counter';
import { formatRate, share } from './rates';
import { SectionHeading } from './section-heading';

type Outcomes = Pick<Record<ApplicationStatus, number>, 'rejected' | 'withdrawn'>;

/** False on the first paint, true from the next frame: lets the bars grow in from zero. */
function useGrown() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return grown;
}

/**
 * Applied → Screening → Interview → Offer: how many of the period's applications reached
 * each stage (or a later one). Bars share one scale (Applied fills the track), one hue;
 * each row also gives the step rate from the stage before.
 *
 * Motion: on first load the bars grow in stage by stage and the counts roll up; a new range
 * re-sizes them the same way. CSS transitions on the duration tokens, delay included, so
 * prefers-reduced-motion (durations 0) shows the end state at once.
 */
/** Where the period's applications ended up instead: plain totals, no stage split. */
function Outcome({
  label,
  tone,
  value,
  cause,
}: {
  label: string;
  /** Status text colour (AA on paper, like the status kickers elsewhere). */
  tone: string;
  value: number;
  cause: string | null;
}) {
  return (
    <div className="grid content-start gap-1">
      <dt className={cn('kicker', tone)}>{label}</dt>
      <dd className="display-face text-[2.125rem] leading-none font-medium tabular-nums">
        <Counter value={value} cause={cause} />
      </dd>
      <dd className="text-[0.8125rem] text-muted-foreground">
        Applied in this period, now {label.toLowerCase()}
      </dd>
    </div>
  );
}

type FunnelProps = {
  funnel: AnalyticsFunnel;
  /** Rejected and Withdrawn totals from the summary; left out until it loads. */
  outcomes?: Outcomes;
  /**
   * What the figures belong to (the dashboard range), or null while the previous range's
   * are shown: the counts roll when it changes (see Counter). Defaults to a fixed cause.
   */
  cause?: string | null;
  stale?: boolean;
};

function Funnel({ funnel, outcomes, cause = 'funnel', stale = false }: FunnelProps) {
  const applied = funnel.stages[0]?.count ?? 0;
  const grown = useGrown();

  return (
    <figure aria-labelledby="funnel-heading" className="grid content-start gap-3">
      <figcaption>
        <SectionHeading id="funnel-heading" title="Pipeline">
          How far this period’s applications got. Each stage counts everything that reached it or
          went further.
        </SectionHeading>
      </figcaption>

      {applied === 0 ? (
        <p className="border border-dashed border-border-quiet px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing applied for in this period yet.
        </p>
      ) : (
        <>
          <ol
            aria-hidden="true"
            className={cn(
              'grid gap-1 transition-opacity duration-(--duration-fast)',
              stale && 'opacity-60',
            )}
          >
            {funnel.stages.map((stage, i) => {
              const fraction = share(stage.count, applied);
              const previous = funnel.stages[i - 1];
              return (
                <li
                  key={stage.stage}
                  className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-x-4"
                >
                  <span className="text-[0.9375rem] font-semibold">
                    {statusLabels[stage.stage]}
                  </span>
                  <span className="h-10 bg-muted">
                    <span
                      data-stage-bar={stage.stage}
                      className="block h-full rounded-r-[4px] bg-primary transition-[width] duration-(--duration-slower) ease-out-quint"
                      style={{
                        // A zero keeps a sliver, so the row visibly has a value of 0.
                        width: grown ? (fraction > 0 ? `${fraction * 100}%` : '2px') : '0%',
                        // Stage by stage; 0 under reduced motion, like every duration token.
                        transitionDelay: `calc(var(--duration-fast) * ${i})`,
                      }}
                    />
                  </span>
                  <span className="text-right display-face text-[1.625rem] leading-none font-medium tabular-nums">
                    <Counter value={stage.count} cause={cause} />
                  </span>
                  <span className="col-start-2 pt-1 pb-2 text-[0.8125rem] text-muted-foreground">
                    {previous
                      ? `${formatRate(stage.rate_from_previous)} of ${statusLabels[previous.stage]}`
                      : 'Every application in the period'}
                  </span>
                </li>
              );
            })}
          </ol>
          {outcomes && (
            <dl className="grid grid-cols-2 gap-6 border-t pt-3.5">
              <Outcome
                label="Rejected"
                tone="text-status-rejected"
                value={outcomes.rejected}
                cause={cause}
              />
              <Outcome
                label="Withdrawn"
                tone="text-status-withdrawn"
                value={outcomes.withdrawn}
                cause={cause}
              />
            </dl>
          )}
        </>
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

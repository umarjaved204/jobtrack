import { cn } from '@/lib/utils';
import type { AnalyticsSources } from '@/types/analytics';

import { BarRow } from './bar-row';
import { formatRate, isSmallSample, MIN_SAMPLE, share } from './rates';

const NOT_SET = 'Not set';

/**
 * Where this period's applications came from: the bar is how many, the text how many of
 * those reached an interview. Rates from fewer than MIN_SAMPLE applications are muted and
 * flagged, so a lucky 1 of 1 doesn't read as the best source.
 */
function Sources({ sources, stale = false }: { sources: AnalyticsSources; stale?: boolean }) {
  const rows = sources.sources;
  const most = Math.max(0, ...rows.map((r) => r.applied));
  const anySmall = rows.some((r) => isSmallSample(r.applied));

  return (
    <figure aria-labelledby="sources-heading" className="grid content-start gap-3">
      <figcaption className="grid gap-1">
        <h2 id="sources-heading" className="font-display text-2xl font-semibold">
          Sources
        </h2>
        <p className="text-sm text-muted-foreground">
          Where you found the roles you applied for, and how many reached an interview.
        </p>
      </figcaption>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing applied for in this period yet. Add a source to each application to see which ones
          work best.
        </p>
      ) : (
        <>
          <ul
            aria-hidden="true"
            className={cn(
              'divide-y transition-opacity duration-(--duration-fast)',
              stale && 'opacity-60',
            )}
          >
            {rows.map((row) => {
              const small = isSmallSample(row.applied);
              return (
                <BarRow
                  key={row.source ?? ''}
                  name={
                    row.source ?? (
                      <span className="font-normal text-muted-foreground">{NOT_SET}</span>
                    )
                  }
                  fraction={share(row.applied, most)}
                  figures={
                    <>
                      <span className="figures text-base font-semibold">{row.applied}</span>
                      <span
                        className={cn(
                          'ml-2 inline-block w-36 text-left whitespace-nowrap',
                          'text-muted-foreground',
                          // Italic + asterisk, not a fainter colour: that would drop below AA.
                          small && 'italic',
                        )}
                      >
                        {row.interviewed} interviewed ({formatRate(row.interview_rate)}
                        {small && '*'})
                      </span>
                    </>
                  }
                />
              );
            })}
          </ul>
          {anySmall && (
            <p aria-hidden="true" className="text-xs text-muted-foreground">
              * Fewer than {MIN_SAMPLE} applications: too few to compare rates.
            </p>
          )}
        </>
      )}

      <table className="sr-only">
        <caption>Applications and interviews by source</caption>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Applied</th>
            <th scope="col">Reached an interview</th>
            <th scope="col">Interview rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.source ?? ''}>
              <th scope="row">{row.source ?? NOT_SET}</th>
              <td>{row.applied}</td>
              <td>{row.interviewed}</td>
              <td>
                {formatRate(row.interview_rate)}
                {isSmallSample(row.applied) &&
                  ` (fewer than ${MIN_SAMPLE} applications, too few to compare)`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export { Sources };

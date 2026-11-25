import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns/format';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from '@/components/load-error';

import { matchesQuery } from './api';
import { matchLinkFor } from './match-schema';
import { BAND_LABELS, scoreBand } from './score-band';

/** The newest match linked to an application, and a way to run one for it. */
function LatestMatchSection({ applicationId }: Readonly<{ applicationId: string }>) {
  const latest = useQuery(matchesQuery({ applicationId, pageSize: 1 }));

  let content;
  if (latest.isPending) {
    content = (
      <Loading label="Loading the latest match">
        <Skeleton className="h-20" />
      </Loading>
    );
  } else if (latest.isError) {
    content = (
      <LoadError
        title="Couldn’t load the match"
        error={latest.error}
        onRetry={() => void latest.refetch()}
      />
    );
  } else {
    const match = latest.data.items[0];
    const { total } = latest.data;
    content = match ? (
      <div className="grid gap-1">
        <Link
          to={`/match/${match.id}`}
          className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 rounded-md px-2 py-2 transition-colors duration-(--duration-fast) hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <span className="figures font-display text-4xl leading-none font-semibold">
            {match.score} <span className="sr-only">out of 100</span>
          </span>{' '}
          {/* Real spaces between the parts: they're the link's accessible name. */}
          <span className="grid gap-0.5">
            <span className="font-semibold">{BAND_LABELS[scoreBand(match.score)]}</span>{' '}
            <span className="text-sm text-muted-foreground">
              {match.resume_label},{' '}
              <time dateTime={match.created_at}>
                {format(new Date(match.created_at), 'd MMM yyyy')}
              </time>
            </span>
          </span>
        </Link>
        {(!match.is_current || total > 1) && (
          <p className="flex flex-wrap items-center gap-2 px-2 text-sm text-muted-foreground">
            {!match.is_current && <Badge variant="outline">Older version</Badge>}
            {total > 1 && <span>Latest of {total} matches for this job.</span>}
          </p>
        )}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">
        No match yet. Compare this job’s description with one of your resume versions.
      </p>
    );
  }

  return (
    <section aria-labelledby="latest-match-heading" className="grid gap-3">
      <h2
        id="latest-match-heading"
        className="border-b border-rule pb-2 kicker text-[0.8125rem] font-bold text-foreground"
      >
        Match
      </h2>
      {content}
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link to={matchLinkFor(applicationId)}>Match a job description</Link>
        </Button>
      </div>
    </section>
  );
}

export { LatestMatchSection };

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns/format';
import { useState } from 'react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from '@/features/dashboard/load-error';
import { cn } from '@/lib/utils';

import { matchesQuery } from './api';
import { BAND_LABELS, scoreBand } from './score-band';

const PAGE_SIZE = 10;

/** Past matches, newest first, each linking to its full result. */
function MatchHistory({ className }: Readonly<{ className?: string }>) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    ...matchesQuery({ page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  let body;
  if (history.isPending) {
    body = <Skeleton className="h-40" />;
  } else if (history.isError) {
    body = (
      <LoadError
        title="Couldn’t load your matches"
        error={history.error}
        onRetry={() => void history.refetch()}
      />
    );
  } else if (history.data.total === 0) {
    body = <p className="text-sm text-muted-foreground">Your matches will be listed here.</p>;
  } else {
    const { items, pages } = history.data;
    body = (
      <>
        <ol className={cn('grid border-t', history.isPlaceholderData && 'opacity-60')}>
          {items.map((match) => (
            <li key={match.id} className="border-b">
              <Link
                to={`/match/${match.id}`}
                className="grid grid-cols-[3.5rem_1fr] gap-x-4 px-2 py-3 transition-colors duration-(--duration-fast) hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="row-span-2 figures font-display text-3xl leading-none font-semibold">
                  {match.score}
                  <span className="sr-only">
                    {' '}
                    out of 100, {BAND_LABELS[scoreBand(match.score)]}.
                  </span>
                </span>
                {/* Real spaces between the parts: the gaps are only visual, and the link's
                    accessible name would otherwise run them together. */}
                <span className="truncate font-semibold">{match.jd_excerpt}</span>{' '}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {match.company && <span>{match.company}</span>} <span>{match.resume_label}</span>{' '}
                  <time dateTime={match.created_at}>
                    {format(new Date(match.created_at), 'd MMM yyyy')}
                  </time>
                  {!match.is_current && (
                    <>
                      {' '}
                      <Badge variant="outline">Older version</Badge>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        {pages > 1 && (
          <nav aria-label="Match history pages" className="flex items-center gap-3 text-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </Button>
            <span className="figures text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Older
            </Button>
          </nav>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="match-history" className={cn('grid content-start gap-3', className)}>
      <h2 id="match-history" className="font-display text-2xl font-semibold">
        Past matches
      </h2>
      {body}
    </section>
  );
}

export { MatchHistory };

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns/format';
import { useState } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from '@/components/load-error';
import { cn } from '@/lib/utils';

import { matchesQuery } from './api';
import { BAND_LABELS, scoreBand } from './score-band';

const PAGE_SIZE = 10;

/** Earlier matches, newest first, each linking to its full result. */
function MatchHistory({ className }: Readonly<{ className?: string }>) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    ...matchesQuery({ page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  let body;
  if (history.isPending) {
    body = (
      <Loading label="Loading earlier matches" className="grid">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-t py-3.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </Loading>
    );
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
        <div className="overflow-x-auto">
          <table
            aria-busy={history.isPlaceholderData || undefined}
            className={cn(
              'w-full min-w-xl border-collapse text-[0.9375rem] transition-opacity duration-(--duration-fast)',
              history.isPlaceholderData && 'opacity-60',
            )}
          >
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-3 pr-3 kicker font-semibold">
                  Date
                </th>
                <th scope="col" className="p-3 kicker font-semibold">
                  Job
                </th>
                <th scope="col" className="p-3 kicker font-semibold">
                  Resume
                </th>
                <th scope="col" className="py-3 pl-3 kicker font-semibold">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((match) => (
                <tr key={match.id} className="border-t transition-colors hover:bg-accent">
                  <td className="py-3 pr-3 align-top text-[0.8125rem] whitespace-nowrap text-muted-foreground">
                    <time dateTime={match.created_at} className="figures">
                      {format(new Date(match.created_at), 'd MMM yyyy')}
                    </time>
                  </td>
                  <td className="p-3 align-top">
                    <Link
                      to={`/match/${match.id}`}
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      {match.company
                        ? [match.company, match.role_title].filter(Boolean).join(' · ')
                        : match.jd_excerpt}
                    </Link>
                    {match.company && (
                      <p className="truncate text-sm text-muted-foreground">{match.jd_excerpt}</p>
                    )}
                  </td>
                  <td className="p-3 align-top text-muted-foreground">{match.resume_label}</td>
                  <td className="py-3 pl-3 align-top whitespace-nowrap">
                    <span className="font-display text-[1.375rem] leading-none font-medium tabular-nums">
                      {match.score}
                    </span>{' '}
                    <span className="text-[0.8125rem] text-muted-foreground">
                      {match.is_current ? BAND_LABELS[scoreBand(match.score)] : 'Older version'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule pb-2.5">
        <h2 id="match-history" className="font-display text-section font-semibold">
          Earlier matches
        </h2>
        {history.data && history.data.total > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="figures">{history.data.total}</span>{' '}
            {history.data.total === 1 ? 'result' : 'results'} ·{' '}
            <Link to="/settings" className="text-primary-text underline underline-offset-2">
              delete them in Settings
            </Link>
          </p>
        )}
      </header>
      {body}
    </section>
  );
}

export { MatchHistory };

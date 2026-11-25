import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';

import { matchQuery } from './api';
import { MatchResult } from './match-result';
import { rerunState } from './match-schema';

/** One saved match: the result, the advert it was run against, and "Run again". */
function MatchDetailPage() {
  const { matchId = '' } = useParams();
  const navigate = useNavigate();
  const match = useQuery(matchQuery(matchId));
  const notFound = isApiError(match.error) && match.error.status === 404;
  let problem = 'Something went wrong. Please try again.';
  if (notFound) problem = 'It may belong to another account, or the link is wrong.';
  else if (isApiError(match.error)) problem = match.error.detail;
  const rerun = () => {
    if (match.data) void navigate('/match', { state: rerunState(match.data) });
  };

  return (
    <>
      <Button asChild variant="link" size="sm" className="mb-4">
        <Link to="/match">
          <ArrowLeft /> All matches
        </Link>
      </Button>
      {match.isPending && (
        <Loading label="Loading the match" className="grid gap-3">
          <Skeleton className="h-14 w-72" />
          <Skeleton className="h-40" />
        </Loading>
      )}
      {match.isError && (
        <>
          <PageHeader title={notFound ? 'Match not found' : 'This match didn’t load'} />
          <Alert className="mt-6 max-w-xl">{problem}</Alert>
        </>
      )}
      {match.data && (
        <>
          <PageHeader
            kicker="AI match"
            title={match.data.company ? `${match.data.company} match` : 'Match result'}
            description={match.data.jd_excerpt}
            actions={
              <Button variant="outline" onClick={rerun}>
                Run again
              </Button>
            }
          />
          <MatchResult match={match.data} className="mt-8" onRerun={rerun} />
          <details className="mt-10 border-t pt-4">
            <summary className="cursor-pointer font-semibold">The job description</summary>
            <p className="mt-3 max-w-prose text-sm whitespace-pre-line text-muted-foreground">
              {match.data.jd_text}
            </p>
          </details>
        </>
      )}
    </>
  );
}

export { MatchDetailPage };

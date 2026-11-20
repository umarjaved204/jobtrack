import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { matchesQuery, useDeleteMatchHistory } from '@/features/match/api';
import { isApiError } from '@/lib/api/errors';

function savedMatches(total: number) {
  return total === 1 ? '1 saved match' : `${total} saved matches`;
}

/** Deletes every saved match result and this browser's cached match vectors. */
function MatchHistorySection() {
  const [confirming, setConfirming] = useState(false);
  // Only the total is needed: one item per page keeps the request small.
  const matches = useQuery(matchesQuery({ pageSize: 1 }));
  const remove = useDeleteMatchHistory();
  const total = matches.data?.total;

  function deleteHistory() {
    remove.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        toast.success('Match history deleted');
      },
    });
  }

  return (
    <section
      aria-labelledby="match-history-heading"
      className="grid gap-3 border-t border-rule pt-6"
    >
      <h2 id="match-history-heading" className="font-display text-xl font-semibold">
        Match history
      </h2>
      <p className="max-w-prose text-muted-foreground">
        {total === undefined ? 'Your saved match results' : `You have ${savedMatches(total)}`}, plus
        the match data this browser keeps to make repeat matches faster. Deleting them makes resume
        versions that only matches had used editable again.
      </p>
      <div>
        <Button
          variant="outline"
          onClick={() => {
            remove.reset();
            setConfirming(true);
          }}
        >
          Delete match history
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your match history?"
        description={
          <>
            {total === undefined ? 'Every saved match result' : `All ${savedMatches(total)}`} and
            this browser’s cached match data will be deleted. Resume versions sent with an
            application stay as they are. This can’t be undone.
          </>
        }
        confirmLabel="Delete match history"
        pending={remove.isPending}
        error={
          remove.isError
            ? isApiError(remove.error)
              ? remove.error.detail
              : 'Couldn’t delete it. Try again.'
            : null
        }
        onConfirm={deleteHistory}
      />
    </section>
  );
}

export { MatchHistorySection };

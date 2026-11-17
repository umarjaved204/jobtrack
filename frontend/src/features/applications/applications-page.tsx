import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, SquareKanban } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';
import type { ApplicationStatus } from '@/types/application';

import { boardQuery } from './api';
import { ApplicationFormSheet } from './application-form-sheet';
import { KanbanBoard } from './kanban-board';

function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your board" className="flex gap-3 overflow-hidden">
      {[3, 2, 1, 2].map((cards, i) => (
        <div
          key={i}
          className="grid w-72 shrink-0 content-start gap-2 rounded-lg bg-paper-sunken/60 p-2"
        >
          <Skeleton className="m-1 h-5 w-24" />
          {Array.from({ length: cards }, (_, j) => (
            <Skeleton key={j} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ApplicationsPage() {
  const board = useQuery(boardQuery());
  const [form, setForm] = useState<{ open: boolean; status: ApplicationStatus }>({
    open: false,
    status: 'wishlist',
  });
  const openForm = (status: ApplicationStatus) => setForm({ open: true, status });
  const total = board.data?.columns.reduce((n, c) => n + c.applications.length, 0) ?? 0;

  let content;
  if (board.isPending) {
    content = <BoardSkeleton />;
  } else if (board.isError) {
    content = (
      <Alert title="Your board didn’t load">
        <p>{isApiError(board.error) ? board.error.detail : 'Something went wrong.'}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void board.refetch()}>
          <RotateCcw /> Try again
        </Button>
      </Alert>
    );
  } else if (total === 0) {
    content = (
      <EmptyState
        icon={SquareKanban}
        title="No applications yet"
        action={
          <Button onClick={() => openForm('wishlist')}>
            <Plus /> Add your first application
          </Button>
        }
      >
        Start with a role you’ve applied for, or one you’re keeping an eye on.
      </EmptyState>
    );
  } else {
    content = <KanbanBoard board={board.data} onAdd={openForm} />;
  }

  return (
    <>
      <PageHeader
        kicker="Pipeline"
        title="Applications"
        description="Every role you’re tracking, from wishlist to offer."
        actions={
          <Button onClick={() => openForm('wishlist')}>
            <Plus /> Add application
          </Button>
        }
      />
      <div className="mt-6">{content}</div>
      <ApplicationFormSheet
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        mode={{ type: 'create', status: form.status }}
      />
    </>
  );
}

export { ApplicationsPage };

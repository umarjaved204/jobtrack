import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, SquareKanban, Table2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import type { ApplicationStatus } from '@/types/application';

import { boardQuery } from './api';
import { wantsAddApplication } from './add-application-state';
import { ApplicationFormSheet } from './application-form-sheet';
import { ApplicationsTableView } from './applications-table-view';
import { KanbanBoard } from './kanban-board';
import {
  serializeTableParams,
  type TableParams,
  updateTableParams,
  type View,
} from './table-params';
import { useTableParams } from './use-table-params';

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

/** Board / Table switch. Links, so each view has its own URL (filters are kept). */
function ViewSwitch({ params }: { params: TableParams }) {
  const options: { view: View; label: string; icon: typeof Table2 }[] = [
    { view: 'board', label: 'Board', icon: SquareKanban },
    { view: 'table', label: 'Table', icon: Table2 },
  ];
  return (
    <nav aria-label="View" className="flex rounded-md border border-rule bg-card p-0.5">
      {options.map(({ view, label, icon: Icon }) => {
        const current = params.view === view;
        return (
          <Link
            key={view}
            to={{ search: `?${serializeTableParams(updateTableParams(params, { view }))}` }}
            preventScrollReset
            aria-current={current ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-semibold',
              current ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function BoardView({ onAdd }: { onAdd: (status: ApplicationStatus) => void }) {
  const board = useQuery(boardQuery());
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
          <Button onClick={() => onAdd('wishlist')}>
            <Plus /> Add your first application
          </Button>
        }
      >
        Start with a role you’ve applied for, or one you’re keeping an eye on.
      </EmptyState>
    );
  } else {
    content = <KanbanBoard board={board.data} onAdd={onAdd} />;
  }

  return content;
}

function ApplicationsPage() {
  const [params] = useTableParams();
  const [form, setForm] = useState<{ open: boolean; status: ApplicationStatus }>({
    open: false,
    status: 'wishlist',
  });
  const openForm = (status: ApplicationStatus) => setForm({ open: true, status });
  // "Add an application" from the ⌘K palette arrives as navigation state. Read while
  // rendering (no effect, no flash); closing the form clears it, so Back won't reopen it.
  const location = useLocation();
  const navigate = useNavigate();
  const addRequested = wantsAddApplication(location.state);
  const formOpen = form.open || addRequested;
  const formStatus = addRequested && !form.open ? 'wishlist' : form.status;
  const onFormOpenChange = (open: boolean) => {
    setForm((f) => ({ ...f, open }));
    if (!open && addRequested) {
      void navigate(
        { search: location.search, hash: location.hash },
        { replace: true, state: null, preventScrollReset: true },
      );
    }
  };

  return (
    <>
      <PageHeader
        kicker="Pipeline"
        title="Applications"
        description="Every role you’re tracking, from wishlist to offer."
        actions={
          <>
            <ViewSwitch params={params} />
            <Button onClick={() => openForm('wishlist')}>
              <Plus /> Add application
            </Button>
          </>
        }
      />
      <div className="mt-6">
        {params.view === 'table' ? (
          <ApplicationsTableView onAdd={openForm} />
        ) : (
          <BoardView onAdd={openForm} />
        )}
      </div>
      <ApplicationFormSheet
        open={formOpen}
        onOpenChange={onFormOpenChange}
        mode={{ type: 'create', status: formStatus }}
      />
    </>
  );
}

export { ApplicationsPage };

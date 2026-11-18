import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, RotateCcw, SearchX, Table2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isApiError } from '@/lib/api/errors';
import type { ApplicationStatus, Page } from '@/types/application';

import { applicationsListQuery } from './api';
import { ApplicationsTable, TableSkeleton } from './applications-table';
import {
  clearedFilters,
  hasFilters,
  pageSizes,
  serializeTableParams,
  type TableParams,
  toApplicationFilters,
  updateTableParams,
} from './table-params';
import { TableToolbar } from './table-toolbar';
import { useTableParams } from './use-table-params';

const plural = (n: number) => `${n} application${n === 1 ? '' : 's'}`;

function Pagination({
  data,
  params,
  update,
}: {
  data: Page<unknown>;
  params: TableParams;
  update: ReturnType<typeof useTableParams>[1];
}) {
  const first = (data.page - 1) * data.page_size + 1;
  const last = first + data.items.length - 1;
  // Real links (not buttons): they can be opened in a new tab and show their target.
  const pageLink = (page: number) => ({
    search: `?${serializeTableParams(updateTableParams(params, { page })).toString()}`,
  });
  const linkClass = 'aria-disabled:pointer-events-none aria-disabled:opacity-40';

  return (
    <nav
      aria-label="Pages"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      {/* Announced when the results change (filters, paging). */}
      <p role="status" className="text-muted-foreground">
        {data.total > data.items.length ? (
          <>
            Showing <span className="font-mono text-foreground">{first}</span> to{' '}
            <span className="font-mono text-foreground">{last}</span> of {plural(data.total)}
          </>
        ) : (
          plural(data.total)
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="page-size" className="font-normal text-muted-foreground">
            Rows per page
          </Label>
          <Select
            value={String(params.pageSize)}
            onValueChange={(value) =>
              update({ pageSize: pageSizes.find((n) => String(n) === value) ?? params.pageSize })
            }
          >
            <SelectTrigger id="page-size" size="sm" className="w-18">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data.pages > 1 && (
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className={linkClass}>
              <Link
                to={pageLink(data.page - 1)}
                preventScrollReset
                aria-disabled={data.page <= 1 || undefined}
                tabIndex={data.page <= 1 ? -1 : undefined}
              >
                <ChevronLeft /> Previous
              </Link>
            </Button>
            <span className="px-2 whitespace-nowrap">
              Page <span className="font-mono">{data.page}</span> of{' '}
              <span className="font-mono">{data.pages}</span>
            </span>
            <Button asChild variant="outline" size="sm" className={linkClass}>
              <Link
                to={pageLink(data.page + 1)}
                preventScrollReset
                aria-disabled={data.page >= data.pages || undefined}
                tabIndex={data.page >= data.pages ? -1 : undefined}
              >
                Next <ChevronRight />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}

/** The Applications page in table view: toolbar, table, pagination; state in the URL. */
function ApplicationsTableView({ onAdd }: { onAdd: (status: ApplicationStatus) => void }) {
  const [params, update] = useTableParams();
  const list = useQuery(applicationsListQuery(toApplicationFilters(params)));
  const filtered = hasFilters(params);

  // A page past the end (an old link, or the last row on a page was deleted): go to the
  // last page that exists instead of showing an empty one.
  const pages = list.data?.pages;
  // (No results is 0 pages: page 1 then shows the empty state, it isn't out of range.)
  const outOfRange =
    !list.isPlaceholderData && pages !== undefined && pages > 0 && params.page > pages;
  useEffect(() => {
    if (outOfRange) update({ page: pages }, { replace: true });
  }, [outOfRange, pages, update]);

  let content;
  if (list.isError) {
    content = (
      <Alert title="Your applications didn’t load">
        <p>{isApiError(list.error) ? list.error.detail : 'Something went wrong.'}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
          <RotateCcw /> Try again
        </Button>
      </Alert>
    );
  } else if (!list.data) {
    content = <TableSkeleton />;
  } else if (list.data.total === 0 && !filtered) {
    content = (
      <EmptyState
        icon={Table2}
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
  } else if (list.data.total === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No applications match"
        action={
          <Button variant="outline" onClick={() => update(clearedFilters)}>
            Clear filters
          </Button>
        }
      >
        Try a shorter search or fewer filters.
      </EmptyState>
    );
  } else {
    content = (
      <>
        <ApplicationsTable
          applications={list.data.items}
          sort={params.sort}
          onSort={(sort) => update({ sort })}
          stale={list.isPlaceholderData}
          caption={filtered ? 'Applications matching your filters' : 'All applications'}
        />
        <Pagination data={list.data} params={params} update={update} />
      </>
    );
  }

  const nothingYet = list.data?.total === 0 && !filtered; // no filters to offer
  return (
    <div className="grid gap-4">
      {!nothingYet && <TableToolbar params={params} update={update} />}
      {content}
    </div>
  );
}

export { ApplicationsTableView };

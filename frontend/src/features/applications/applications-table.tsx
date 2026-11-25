import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type * as React from 'react';
import { Link, useLocation } from 'react-router';

import { StatusBadge } from '@/components/status-badge';
import { TagChip } from '@/components/tag-chip';
import { Loading } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { type Application, type ApplicationSort, workModeLabels } from '@/types/application';

import { monogram } from './monogram';
import { columnSortState, nextColumnSort, type SortableColumn } from './table-params';

type SortProps = { sort: ApplicationSort; onSort: (sort: ApplicationSort) => void };

/** A column header that sorts by its column; `aria-sort` tells screen readers the order. */
function SortHeader({
  column,
  sort,
  onSort,
  className,
  children,
}: SortProps & { column: SortableColumn; className?: string; children: React.ReactNode }) {
  const state = columnSortState(column, sort);
  const Icon = state === 'ascending' ? ArrowUp : state === 'descending' ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={state}
      // The sorted column reads in ink, the others in secondary text.
      className={cn(className, state !== 'none' && 'font-bold text-foreground')}
    >
      <button
        type="button"
        onClick={() => onSort(nextColumnSort(column, sort))}
        // Buttons reset text-transform (preflight); inherit the header's kicker style.
        className="-mx-1 inline-flex min-h-8 cursor-pointer items-center gap-1 px-1 [text-transform:inherit] hover:text-foreground"
      >
        {children}
        <Icon
          aria-hidden="true"
          className={cn('size-3.5', state === 'none' && 'text-muted-foreground opacity-60')}
        />
      </button>
    </th>
  );
}

/** An empty cell: a dash to the eye, words to a screen reader. */
function NoValue({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        –
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

function DateCell({ value, none }: { value: string | null; none: string }) {
  return value ? (
    <time dateTime={value} className="figures text-[0.8125rem] whitespace-nowrap">
      {formatDateOnly(value, 'd MMM yyyy')}
    </time>
  ) : (
    <NoValue label={none} />
  );
}

// Phones show one column (status and applied date move under the role); tablets add
// status and applied date back; source, tags and deadline need a wide screen.
const notPhone = 'hidden sm:table-cell';
const wide = 'hidden md:table-cell';
// Column headers borrow the kicker style (CLAUDE.md "All-caps"); they stay <th>.
const th = 'px-3 py-2.5 text-left kicker font-semibold text-muted-foreground';
const td = 'px-3 py-3 align-top';

function TableHead({ sort, onSort }: SortProps) {
  return (
    <thead className="border-b border-rule">
      <tr>
        <SortHeader column="company" sort={sort} onSort={onSort} className={th}>
          Company and role
        </SortHeader>
        <th scope="col" className={cn(th, notPhone)}>
          Status
        </th>
        <th scope="col" className={cn(th, wide)}>
          Source
        </th>
        <th scope="col" className={cn(th, wide)}>
          Tags
        </th>
        <SortHeader column="applied" sort={sort} onSort={onSort} className={cn(th, notPhone)}>
          Applied
        </SortHeader>
        <SortHeader column="deadline" sort={sort} onSort={onSort} className={cn(th, wide)}>
          Apply by
        </SortHeader>
      </tr>
    </thead>
  );
}

type ApplicationsTableProps = SortProps & {
  applications: Application[];
  /** Showing the previous results while new ones load. */
  stale?: boolean;
  caption: string;
};

function ApplicationsTable({ applications, sort, onSort, stale, caption }: ApplicationsTableProps) {
  // The detail page's back link returns here, filters and page included.
  const { pathname, search } = useLocation();
  const from = pathname + search;
  return (
    <div className="overflow-x-auto">
      <table
        aria-busy={stale || undefined}
        className={cn(
          'w-full border-collapse transition-opacity duration-(--duration-fast)',
          stale && 'opacity-60',
        )}
      >
        <caption className="sr-only">{caption}</caption>
        <TableHead sort={sort} onSort={onSort} />
        <tbody>
          {applications.map((a) => (
            <tr key={a.id} className="border-b transition-colors hover:bg-accent">
              <td className={cn(td, 'sm:min-w-56')}>
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-[30px] shrink-0 place-items-center bg-muted display-face text-[0.8125rem] font-semibold"
                  >
                    {monogram(a.company)}
                  </span>
                  <div className="grid min-w-0 gap-0.5">
                    <Link
                      to={`/applications/${a.id}`}
                      state={{ from }}
                      className="font-bold underline-offset-4 hover:underline"
                    >
                      {a.company}
                    </Link>
                    <p className="font-display text-[1.0625rem] leading-snug">{a.role_title}</p>
                    {(a.location || a.work_mode) && (
                      <p className="text-[0.8125rem] text-muted-foreground">
                        {[a.location, a.work_mode && workModeLabels[a.work_mode]]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-10 sm:hidden">
                  <StatusBadge status={a.status} />
                  {a.applied_on && (
                    <span className="text-xs text-muted-foreground">
                      Applied <DateCell value={a.applied_on} none="" />
                    </span>
                  )}
                </div>
              </td>
              <td className={cn(td, notPhone)}>
                <StatusBadge status={a.status} />
              </td>
              <td className={cn(td, wide, 'text-sm text-muted-foreground')}>
                {a.source ?? <NoValue label="No source" />}
              </td>
              <td className={cn(td, wide)}>
                {a.tags.length > 0 ? (
                  <ul className="flex max-w-56 flex-wrap gap-1" aria-label="Tags">
                    {a.tags.map((tag) => (
                      <li key={tag.id}>
                        <TagChip name={tag.name} color={tag.color} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <NoValue label="No tags" />
                )}
              </td>
              <td className={cn(td, notPhone)}>
                <DateCell value={a.applied_on} none="Not applied yet" />
              </td>
              <td className={cn(td, wide)}>
                <DateCell value={a.deadline_on} none="No apply-by date" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Loading label="Loading applications" className="grid gap-px">
      <Skeleton className="mb-2 h-6 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </Loading>
  );
}

export { ApplicationsTable, TableSkeleton };

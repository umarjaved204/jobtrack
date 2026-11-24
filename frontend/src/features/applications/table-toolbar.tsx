import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ChevronDown, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { TagChip } from '@/components/tag-chip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateOnly, isDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { applicationSorts, applicationStatuses, statusLabels } from '@/types/application';

import { boardQuery, tagsQuery } from './api';
import { FilterMenu } from './filter-menu';
import {
  clearedFilters,
  hasFilters,
  SEARCH_DEBOUNCE_MS,
  sortLabels,
  type TableParams,
} from './table-params';

type Update = (patch: Partial<TableParams>, options?: { replace?: boolean }) => void;

/**
 * Search box that updates the URL after a pause in typing (or at once on Enter).
 *
 * `value` is the search in the URL. The box keeps its own draft while typing and follows
 * the URL when it changes from elsewhere (Back/Forward, "Clear filters").
 *
 * The URL updates a moment after the box sends a search, possibly after more typing.
 * So the box remembers what it sent: when the URL catches up with one of those, it's an
 * echo and must not overwrite the newer draft. Any other change comes from elsewhere.
 */
function SearchField({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [inFlight, setInFlight] = useState<string[]>([]);
  if (value !== seen) {
    // Adjusting state while rendering (React's documented alternative to an effect).
    setSeen(value);
    const echo = inFlight.indexOf(value);
    if (echo >= 0) {
      setInFlight(inFlight.slice(echo + 1));
    } else {
      setInFlight([]);
      setDraft(value);
    }
  }

  const query = draft.trim();
  const pending = query !== value && query !== inFlight.at(-1);
  const send = useCallback(
    (q: string) => {
      setInFlight((sent) => [...sent, q]);
      onSearch(q);
    },
    [onSearch],
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => send(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, pending, send]);

  return (
    <form
      role="search"
      className="relative w-full sm:max-w-95 sm:flex-[1_1_17.5rem]"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) send(query);
      }}
    >
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Search company or role"
        placeholder="Search company or role…"
        value={draft}
        maxLength={100}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => setDraft(event.target.value)}
        className="pl-9"
      />
    </form>
  );
}

function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
}) {
  const active = Boolean(from || to);
  const summary =
    from && to
      ? `${formatDateOnly(from, 'd MMM')} to ${formatDateOnly(to, 'd MMM yyyy')}`
      : from
        ? `From ${formatDateOnly(from, 'd MMM yyyy')}`
        : to
          ? `Until ${formatDateOnly(to, 'd MMM yyyy')}`
          : null;
  const read = (value: string) => (isDateOnly(value) ? value : null);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('border-input bg-card font-medium', active && 'border-foreground')}
          // The dates alone don't say what they filter; the name includes the visible text.
          aria-label={summary ? `Applied: ${summary}` : undefined}
        >
          <CalendarRange aria-hidden="true" className="text-muted-foreground" />
          {summary ?? 'Applied'}
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-64 gap-3">
        <p className="text-sm font-semibold">Applied between</p>
        <div className="grid gap-1.5">
          <Label htmlFor="applied-from">From</Label>
          <Input
            id="applied-from"
            type="date"
            value={from ?? ''}
            max={to ?? undefined}
            onChange={(event) => onChange({ from: read(event.target.value), to })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="applied-to">To</Label>
          <Input
            id="applied-to"
            type="date"
            value={to ?? ''}
            min={from ?? undefined}
            onChange={(event) => onChange({ from, to: read(event.target.value) })}
          />
        </div>
        {active && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ from: null, to: null })}>
            Clear dates
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Distinct sources across all applications (from the board, which holds every one). */
function useSourceOptions(selected: string[]) {
  const { data: board } = useQuery(boardQuery());
  const byKey = new Map<string, string>();
  for (const column of board?.columns ?? []) {
    for (const { source } of column.applications) {
      if (source && !byKey.has(source.toLowerCase())) byKey.set(source.toLowerCase(), source);
    }
  }
  // Keep a source chosen via the URL listed even if no application uses it any more.
  for (const source of selected) {
    if (!byKey.has(source.toLowerCase())) byKey.set(source.toLowerCase(), source);
  }
  return [...byKey.values()]
    .sort((a, b) => a.localeCompare(b))
    .map((source) => ({ value: source, label: source }));
}

/** Search, filters and sort above the applications table. All state lives in the URL. */
function TableToolbar({ params, update }: { params: TableParams; update: Update }) {
  const { data: tags = [] } = useQuery(tagsQuery());
  const sourceOptions = useSourceOptions(params.source);

  // Typing refines a search in place (one history entry per search, not per pause);
  // starting or clearing one is its own entry, so Back returns to the unsearched list.
  const hasSearch = params.q !== '';
  const onSearch = useCallback(
    (q: string) => update({ q }, { replace: hasSearch && q !== '' }),
    [update, hasSearch],
  );

  return (
    // The filter bar sits under a heavy ink rule, like the dashboard's figures.
    <div className="flex flex-wrap items-center gap-2.5 border-t-[3px] border-b border-t-rule py-3.5">
      <SearchField value={params.q} onSearch={onSearch} />
      <FilterMenu
        label="Status"
        options={applicationStatuses.map((status) => ({
          value: status,
          label: statusLabels[status],
          display: <StatusBadge status={status} />,
        }))}
        selected={params.status}
        onChange={(status) =>
          update({ status: applicationStatuses.filter((s) => status.includes(s)) })
        }
      />
      <FilterMenu
        label="Source"
        searchable
        options={sourceOptions}
        selected={params.source}
        onChange={(source) => update({ source })}
        emptyText="No sources yet. Add one to an application."
      />
      <FilterMenu
        label="Tags"
        searchable
        options={tags.map((tag) => ({
          value: tag.id,
          label: tag.name,
          display: <TagChip name={tag.name} color={tag.color} />,
        }))}
        selected={params.tag}
        onChange={(tag) => update({ tag })}
        emptyText="No tags yet. Add them from an application."
      />
      <DateRangeFilter from={params.from} to={params.to} onChange={(range) => update(range)} />
      {hasFilters(params) && (
        <Button variant="link" className="h-11" onClick={() => update(clearedFilters)}>
          <X /> Clear filters
        </Button>
      )}

      <div className="flex items-center gap-2 sm:ml-auto">
        <Label htmlFor="table-sort" className="text-sm text-muted-foreground">
          Sort
        </Label>
        <Select
          value={params.sort}
          onValueChange={(sort) =>
            update({ sort: applicationSorts.find((s) => s === sort) ?? params.sort })
          }
        >
          <SelectTrigger id="table-sort" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {applicationSorts.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {sortLabels[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export { TableToolbar };

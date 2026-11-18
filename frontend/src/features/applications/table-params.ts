import { z } from 'zod';

import { isDateOnly } from '@/lib/dates';
import {
  type ApplicationFilters,
  type ApplicationSort,
  applicationSorts,
  type ApplicationStatus,
  applicationStatuses,
  type DateOnly,
} from '@/types/application';

/*
 * The Applications page keeps its view, search, filters, sort and page in the URL, so a
 * filtered table can be bookmarked, shared and restored with Back/Forward.
 *
 * URLs are user input: every param is validated on its own and an invalid one falls back
 * to its default (or is dropped, for list entries) instead of breaking the page or
 * throwing away the valid ones. Defaults are left out of the URL to keep it short.
 */

/** Pause in typing before a search updates the URL (and fetches). */
export const SEARCH_DEBOUNCE_MS = 300;

export const views = ['board', 'table'] as const;
export type View = (typeof views)[number];

export const pageSizes = [10, 20, 50] as const;
export type PageSize = (typeof pageSizes)[number];

export type TableParams = {
  view: View;
  q: string;
  status: ApplicationStatus[];
  source: string[];
  tag: string[];
  from: DateOnly | null;
  to: DateOnly | null;
  sort: ApplicationSort;
  page: number;
  pageSize: PageSize;
};

export const defaultTableParams: TableParams = {
  view: 'board',
  q: '',
  status: [],
  source: [],
  tag: [],
  from: null,
  to: null,
  sort: '-created_at', // the API's default
  page: 1,
  pageSize: 20,
};

// Limits mirror the backend (GET /applications query validation).
const schemas = {
  view: z.enum(views),
  q: z.string().trim().max(100),
  status: z.enum(applicationStatuses),
  source: z.string().trim().min(1).max(50),
  tag: z.string().regex(/^[\w-]{1,64}$/), // a tag id (UUID in the API)
  date: z.string().refine(isDateOnly),
  sort: z.enum(applicationSorts),
  page: z.coerce.number().int().min(1).max(10_000),
  pageSize: z.coerce
    .number()
    .refine((n): n is PageSize => (pageSizes as readonly number[]).includes(n)),
};

function one<T>(schema: z.ZodType<T>, value: string | null, fallback: T): T {
  if (value === null) return fallback;
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

/** Valid entries only, without duplicates (case-insensitive for free text). */
function many<T extends string>(schema: z.ZodType<T>, values: string[]): T[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const result = schema.safeParse(value);
    if (!result.success || seen.has(result.data.toLowerCase())) return [];
    seen.add(result.data.toLowerCase());
    return [result.data];
  });
}

export function parseTableParams(search: URLSearchParams): TableParams {
  const d = defaultTableParams;
  let from = one(schemas.date, search.get('from'), d.from);
  let to = one(schemas.date, search.get('to'), d.to);
  if (from && to && from > to) [from, to] = [d.from, d.to]; // an impossible range: ignore it

  return {
    view: one(schemas.view, search.get('view'), d.view),
    q: one(schemas.q, search.get('q'), d.q),
    status: many(schemas.status, search.getAll('status')),
    source: many(schemas.source, search.getAll('source')),
    tag: many(schemas.tag, search.getAll('tag')),
    from,
    to,
    sort: one(schemas.sort, search.get('sort'), d.sort),
    page: one(schemas.page, search.get('page'), d.page),
    pageSize: one(schemas.pageSize, search.get('page_size'), d.pageSize),
  };
}

export function serializeTableParams(params: TableParams): URLSearchParams {
  const d = defaultTableParams;
  const search = new URLSearchParams();
  if (params.view !== d.view) search.set('view', params.view);
  if (params.q.trim()) search.set('q', params.q.trim());
  for (const status of params.status) search.append('status', status);
  for (const source of params.source) search.append('source', source);
  for (const tag of params.tag) search.append('tag', tag);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.sort !== d.sort) search.set('sort', params.sort);
  if (params.page !== d.page) search.set('page', String(params.page));
  if (params.pageSize !== d.pageSize) search.set('page_size', String(params.pageSize));
  return search;
}

/**
 * Apply a change. Anything that changes which rows match, or their order, goes back to
 * page 1 (page 4 of the old results means nothing in the new ones); paging keeps the rest.
 */
export function updateTableParams(current: TableParams, patch: Partial<TableParams>): TableParams {
  const changesResults = Object.keys(patch).some((key) => key !== 'page' && key !== 'view');
  return { ...current, ...(changesResults ? { page: 1 } : {}), ...patch };
}

export const filterKeys = ['q', 'status', 'source', 'tag', 'from', 'to'] as const;

/** Are any filters applied (search counts; sort and paging don't)? */
export function hasFilters(params: TableParams): boolean {
  return filterKeys.some((key) => {
    const value = params[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

export const clearedFilters: Pick<TableParams, (typeof filterKeys)[number]> = {
  q: '',
  status: [],
  source: [],
  tag: [],
  from: null,
  to: null,
};

/** The API query for these params (see GET /applications). */
export function toApplicationFilters(params: TableParams): ApplicationFilters {
  const filters: ApplicationFilters = {
    sort: params.sort,
    page: params.page,
    page_size: params.pageSize,
  };
  if (params.q) filters.q = params.q;
  if (params.status.length > 0) filters.status = params.status;
  if (params.source.length > 0) filters.source = params.source;
  if (params.tag.length > 0) filters.tag = params.tag;
  if (params.from) filters.from = params.from;
  if (params.to) filters.to = params.to;
  return filters;
}

// ---------------------------------------------------------------- sorting

export const sortLabels: Record<ApplicationSort, string> = {
  '-created_at': 'Recently added',
  created_at: 'Oldest added',
  '-updated_at': 'Recently updated',
  '-applied_on': 'Applied, newest first',
  applied_on: 'Applied, oldest first',
  company: 'Company, A to Z',
  '-company': 'Company, Z to A',
  deadline_on: 'Apply by, soonest first',
};

/** Sortable table columns and the API sorts each one offers, in click order. */
export const sortableColumns = {
  company: ['company', '-company'],
  applied: ['-applied_on', 'applied_on'],
  deadline: ['deadline_on'],
} as const satisfies Record<string, readonly ApplicationSort[]>;
export type SortableColumn = keyof typeof sortableColumns;

/** Sort direction of a column under the current sort, for `aria-sort`. */
export function columnSortState(
  column: SortableColumn,
  sort: ApplicationSort,
): 'ascending' | 'descending' | 'none' {
  if (!(sortableColumns[column] as readonly ApplicationSort[]).includes(sort)) return 'none';
  return sort.startsWith('-') ? 'descending' : 'ascending';
}

/** Clicking a column header: its first sort, then flip direction (if it has two). */
export function nextColumnSort(column: SortableColumn, sort: ApplicationSort): ApplicationSort {
  const options: readonly ApplicationSort[] = sortableColumns[column];
  const index = options.indexOf(sort);
  return options[(index + 1) % options.length] ?? options[0] ?? sort;
}

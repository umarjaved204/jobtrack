import { describe, expect, it } from 'vitest';

import {
  columnSortState,
  defaultTableParams,
  hasFilters,
  nextColumnSort,
  parseTableParams,
  serializeTableParams,
  toApplicationFilters,
  updateTableParams,
} from './table-params';

const parse = (query: string) => parseTableParams(new URLSearchParams(query));

describe('parseTableParams', () => {
  it('gives the defaults for an empty URL', () => {
    expect(parse('')).toEqual(defaultTableParams);
  });

  it('reads every param, with repeated ones as lists', () => {
    expect(
      parse(
        'view=table&q=monzo&status=applied&status=offer&source=LinkedIn&tag=tag-1' +
          '&from=2026-09-01&to=2026-10-31&sort=company&page=3&page_size=50',
      ),
    ).toEqual({
      view: 'table',
      q: 'monzo',
      status: ['applied', 'offer'],
      source: ['LinkedIn'],
      tag: ['tag-1'],
      from: '2026-09-01',
      to: '2026-10-31',
      sort: 'company',
      page: 3,
      pageSize: 50,
    });
  });

  it('falls back to the default for each invalid param, keeping the valid ones', () => {
    expect(
      parse(
        'view=grid&q=wise&sort=salary&page=0&page_size=7&from=2026-02-30&to=yesterday&status=applied',
      ),
    ).toEqual({ ...defaultTableParams, q: 'wise', status: ['applied'] });
  });

  it.each([['-1'], ['1.5'], ['abc'], ['99999']])('ignores page=%s', (page) => {
    expect(parse(`page=${page}`).page).toBe(1);
  });

  it('drops invalid and duplicate list entries', () => {
    expect(
      parse('status=offer&status=hired&status=offer&source=Referral&source=referral&source=')
        .status,
    ).toEqual(['offer']);
    expect(parse('source=Referral&source=referral&source=%20%20').source).toEqual(['Referral']);
    expect(parse('tag=tag-1&tag=<script>').tag).toEqual(['tag-1']);
  });

  it('ignores a search longer than the API accepts, and trims one that fits', () => {
    expect(parse(`q=${'a'.repeat(101)}`).q).toBe('');
    expect(parse('q=%20monzo%20').q).toBe('monzo');
  });

  it('ignores an impossible date range (from after to)', () => {
    const params = parse('from=2026-10-01&to=2026-09-01');
    expect([params.from, params.to]).toEqual([null, null]);
    expect(parse('from=2026-09-01&to=2026-09-01').from).toBe('2026-09-01'); // one day is fine
  });
});

describe('serializeTableParams', () => {
  it('leaves defaults out of the URL', () => {
    expect(serializeTableParams(defaultTableParams).toString()).toBe('');
  });

  it('round-trips through parse', () => {
    const query =
      'view=table&q=monzo&status=applied&status=offer&source=LinkedIn&tag=tag-1' +
      '&from=2026-09-01&to=2026-10-31&sort=company&page=3&page_size=50';
    expect(serializeTableParams(parse(query)).toString()).toBe(query);
  });
});

describe('updateTableParams', () => {
  const onPage3 = { ...defaultTableParams, view: 'table' as const, page: 3 };

  it.each([
    ['search', { q: 'wise' }],
    ['a status filter', { status: ['offer' as const] }],
    ['a date', { from: '2026-09-01' }],
    ['the sort', { sort: 'company' as const }],
    ['the page size', { pageSize: 50 as const }],
  ])('changing %s goes back to page 1', (_, patch) => {
    expect(updateTableParams(onPage3, patch)).toMatchObject({ ...patch, page: 1 });
  });

  it('changing the page or the view keeps everything else', () => {
    expect(updateTableParams(onPage3, { page: 4 })).toEqual({ ...onPage3, page: 4 });
    expect(updateTableParams(onPage3, { view: 'board' })).toEqual({ ...onPage3, view: 'board' });
  });
});

describe('hasFilters / toApplicationFilters', () => {
  it('counts search and filters, not sort or paging', () => {
    expect(hasFilters({ ...defaultTableParams, sort: 'company', page: 2 })).toBe(false);
    expect(hasFilters({ ...defaultTableParams, q: 'x' })).toBe(true);
    expect(hasFilters({ ...defaultTableParams, tag: ['tag-1'] })).toBe(true);
    expect(hasFilters({ ...defaultTableParams, to: '2026-01-01' })).toBe(true);
  });

  it('builds the API query, leaving out empty filters', () => {
    expect(toApplicationFilters(defaultTableParams)).toEqual({
      sort: '-created_at',
      page: 1,
      page_size: 20,
    });
    expect(
      toApplicationFilters({
        ...defaultTableParams,
        q: 'wise',
        status: ['offer'],
        from: '2026-09-01',
      }),
    ).toEqual({
      q: 'wise',
      status: ['offer'],
      from: '2026-09-01',
      sort: '-created_at',
      page: 1,
      page_size: 20,
    });
  });
});

describe('column sorting', () => {
  it('starts each column in its natural order, then flips', () => {
    expect(nextColumnSort('company', '-created_at')).toBe('company');
    expect(nextColumnSort('company', 'company')).toBe('-company');
    expect(nextColumnSort('company', '-company')).toBe('company');
    expect(nextColumnSort('applied', '-created_at')).toBe('-applied_on'); // newest first
    expect(nextColumnSort('applied', '-applied_on')).toBe('applied_on');
  });

  it('keeps a one-direction column as it is', () => {
    expect(nextColumnSort('deadline', '-company')).toBe('deadline_on');
    expect(nextColumnSort('deadline', 'deadline_on')).toBe('deadline_on');
  });

  it('reports aria-sort for the active column only', () => {
    expect(columnSortState('company', '-company')).toBe('descending');
    expect(columnSortState('applied', 'applied_on')).toBe('ascending');
    expect(columnSortState('deadline', '-company')).toBe('none');
  });
});

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import {
  parseTableParams,
  serializeTableParams,
  type TableParams,
  updateTableParams,
} from './table-params';

/**
 * The Applications page state, read from and written to the URL (see table-params.ts).
 *
 * `update` pushes a history entry by default, so Back undoes a filter; pass
 * `{ replace: true }` for in-between states (debounced typing). Scroll position is kept:
 * changing a filter shouldn't jump to the top of the page.
 */
export function useTableParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => parseTableParams(searchParams), [searchParams]);

  const update = useCallback(
    (patch: Partial<TableParams>, { replace = false }: { replace?: boolean } = {}) => {
      setSearchParams(
        (current) => serializeTableParams(updateTableParams(parseTableParams(current), patch)),
        { replace, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  return [params, update] as const;
}

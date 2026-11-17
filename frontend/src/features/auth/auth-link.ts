import { safeNextPath } from '@/lib/safe-next-path';

/** Link between /login and /register that keeps a (validated) `?next=` destination. */
export function authLink(path: '/login' | '/register', rawNext: string | null): string {
  return rawNext ? `${path}?next=${encodeURIComponent(safeNextPath(rawNext))}` : path;
}

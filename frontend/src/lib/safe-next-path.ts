export const DEFAULT_SIGNED_IN_PATH = '/dashboard';

const ORIGIN = 'https://jobtrack.invalid';

/**
 * Validates a `?next=` redirect target. Only same-origin relative paths are allowed;
 * anything else falls back to the dashboard (prevents open redirects after sign-in).
 *
 * Rejected: missing/empty, absolute URLs (`https://…`), scheme URLs (`javascript:…`),
 * protocol-relative `//host`, backslash tricks (`/\host`: browsers treat `\` as `/`), and
 * control characters (browsers strip tabs/newlines, so `/\t/host` would become `//host`).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_SIGNED_IN_PATH;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we reject
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_SIGNED_IN_PATH;
  try {
    const url = new URL(raw, ORIGIN);
    if (url.origin !== ORIGIN) return DEFAULT_SIGNED_IN_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_SIGNED_IN_PATH;
  }
}

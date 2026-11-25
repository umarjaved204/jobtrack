import { ApiError } from './errors';
import { API_BASE, session as defaultSession, type SessionManager } from './session';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Serialised as JSON. */
  body?: unknown;
  signal?: AbortSignal;
};

/** A file from the API: its bytes and the name the server suggests (Content-Disposition). */
export type Download = { blob: Blob; filename: string | null };

type FetchFn = typeof globalThis.fetch;
type SessionLike = Pick<SessionManager, 'getAccessToken' | 'needsRefresh' | 'refresh' | 'end'>;

/**
 * Auth endpoints never carry the access token and never trigger refresh-and-retry:
 * a 401 from /auth/login is "wrong password", from /auth/refresh "no session", not
 * "token expired". Callers handle those responses themselves.
 */
const isAuthEndpoint = (path: string) => path.startsWith('/auth/');

/**
 * JSON fetch wrapper for /api/v1. Adds the bearer token, refreshes it when it is about to
 * expire, and on a 401 refreshes once and retries once. If the session can't be renewed
 * it ends it (listeners take the user to /login). Every failure is an `ApiError`.
 */
export function createApiClient({ session, fetch }: { session: SessionLike; fetch: FetchFn }) {
  async function send(path: string, options: RequestOptions, token: string | null, accept: string) {
    const headers: Record<string, string> = { Accept: accept };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      return await fetch(`${API_BASE}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'same-origin',
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw ApiError.network();
    }
  }

  /** A usable access token, refreshing first if needed. */
  async function validToken(): Promise<string> {
    const token = session.getAccessToken();
    if (token && !session.needsRefresh()) return token;
    const refreshed = await session.refresh();
    if (!refreshed) {
      session.end('expired');
      throw new ApiError(401, 'Your session has ended. Please sign in again.');
    }
    return refreshed.access_token;
  }

  /** The successful response (any 2xx), after the token handling above; else an ApiError. */
  async function respond(
    path: string,
    options: RequestOptions,
    accept = 'application/json',
  ): Promise<Response> {
    let response: Response;

    if (isAuthEndpoint(path)) {
      response = await send(path, options, null, accept);
    } else {
      const token = await validToken();
      response = await send(path, options, token, accept);

      if (response.status === 401) {
        // Another request may already have refreshed while this one was in flight.
        const latest = session.getAccessToken();
        const retryToken =
          latest && latest !== token && !session.needsRefresh()
            ? latest
            : (await session.refresh())?.access_token;
        if (!retryToken) {
          session.end('expired');
          throw await ApiError.fromResponse(response);
        }
        response = await send(path, options, retryToken, accept);
        if (response.status === 401) session.end('expired'); // fresh token rejected: give up
      }
    }

    if (!response.ok) throw await ApiError.fromResponse(response);
    return response;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await respond(path, options);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** GET a file (an export): same auth and errors as `request`, the body kept as a Blob. */
  async function download(
    path: string,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<Download> {
    const response = await respond(path, { ...options, method: 'GET' }, '*/*');
    return {
      blob: await response.blob(),
      filename: filenameFrom(response.headers.get('Content-Disposition')),
    };
  }

  return {
    request,
    download,
    get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, method: 'POST', body }),
    patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, method: 'PATCH', body }),
    delete: <T = void>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, method: 'DELETE' }),
  };
}

/** `attachment; filename="x.zip"` → "x.zip". Only the plain quoted or bare form (what our
 * server sends); anything else is null and the caller picks a name. */
export function filenameFrom(disposition: string | null): string | null {
  const match = disposition?.match(/filename="([^"]+)"|filename=([^;\s]+)/i);
  const name = match?.[1] ?? match?.[2];
  return name ? name.replace(/[/\\]/g, '_') : null;
}

export const api = createApiClient({
  session: defaultSession,
  fetch: (...args) => globalThis.fetch(...args),
});

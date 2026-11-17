/**
 * One error type for every failed API call, so UI code can branch on `status` and show
 * `detail` without knowing the backend's response shapes:
 *   - AppError responses:         {"detail": "Incorrect email or password"}
 *   - FastAPI validation (422):   {"detail": [{"loc": ["body", "email"], "msg": "...", ...}]}
 *   - 429 adds a Retry-After header (seconds).
 *   - status 0 = the request never got a response (offline, DNS, server down).
 */
export class ApiError extends Error {
  readonly status: number;
  /** Human-readable message, safe to show to the user. */
  readonly detail: string;
  /** Field name → message, from 422 validation errors (body fields only). */
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** Seconds to wait before retrying (429 only). */
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    detail: string,
    options: { fieldErrors?: Record<string, string>; retryAfterSeconds?: number | null } = {},
  ) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.fieldErrors = options.fieldErrors ?? {};
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const body: unknown = await response.json().catch(() => null);
    const rawDetail = isRecord(body) ? body['detail'] : undefined;
    const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));

    if (Array.isArray(rawDetail)) {
      return new ApiError(response.status, 'Please check the highlighted fields.', {
        fieldErrors: validationErrorsByField(rawDetail),
        retryAfterSeconds,
      });
    }
    if (typeof rawDetail === 'string' && rawDetail) {
      return new ApiError(response.status, rawDetail, { retryAfterSeconds });
    }
    // A gateway error without our JSON body comes from a proxy (Vite in dev, Vercel in
    // production) that couldn't reach the API: to the user, the server is unreachable.
    if (GATEWAY_STATUSES.has(response.status)) {
      return new ApiError(response.status, UNREACHABLE_MESSAGE, { retryAfterSeconds });
    }
    const detail = FALLBACK_MESSAGES[response.status] ?? 'Something went wrong. Please try again.';
    return new ApiError(response.status, detail, { retryAfterSeconds });
  }

  static network(): ApiError {
    return new ApiError(0, UNREACHABLE_MESSAGE);
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

// Typographic apostrophes (’) in user-facing copy, per the web interface guidelines.
const UNREACHABLE_MESSAGE = 'Can’t reach JobTrack. Check your connection and try again.';

/** Bad Gateway, Service Unavailable, Gateway Timeout. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

const FALLBACK_MESSAGES: Record<number, string> = {
  401: 'Please sign in to continue.',
  403: 'You don’t have access to that.',
  404: 'We couldn’t find that.',
  429: 'Too many attempts. Please wait a moment and try again.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `[{loc: ["body", "email"], msg}]` → `{email: msg}`. First message per field wins. */
function validationErrorsByField(items: unknown[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items) {
    if (!isRecord(item) || !Array.isArray(item['loc']) || typeof item['msg'] !== 'string') continue;
    const [source, field] = item['loc'] as unknown[];
    if (source === 'body' && typeof field === 'string' && !(field in result)) {
      result[field] = item['msg'];
    }
  }
  return result;
}

/** Retry-After is either delta-seconds or an HTTP date (RFC 9110 §10.2.3). */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
}

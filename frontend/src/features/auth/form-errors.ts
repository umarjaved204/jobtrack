import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError, isApiError } from '@/lib/api/errors';

export type ServerErrorOutcome = {
  /** Form-level message (shown in an Alert), or null if everything landed on fields. */
  message: string | null;
  /** Seconds to wait (429), or null. */
  retryAfterSeconds: number | null;
};

const DEFAULT_RETRY_SECONDS = 60;

/**
 * Turns a failed submit into form state: 422 field errors go onto their fields (first one
 * focused), 429 yields a wait, anything else becomes one form-level message.
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): ServerErrorOutcome {
  const apiError = isApiError(error)
    ? error
    : new ApiError(0, 'Something went wrong. Please try again.');

  if (apiError.status === 429) {
    return {
      message: apiError.detail,
      retryAfterSeconds: apiError.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS,
    };
  }

  if (apiError.status === 422) {
    const known = fields.filter((field) => field in apiError.fieldErrors);
    known.forEach((field, index) =>
      setError(
        field,
        { type: 'server', message: apiError.fieldErrors[field] },
        { shouldFocus: index === 0 },
      ),
    );
    if (known.length > 0) return { message: null, retryAfterSeconds: null };
  }

  return { message: apiError.detail, retryAfterSeconds: null };
}

import { describe, expect, it } from 'vitest';

import { ApiError } from './api/errors';
import { shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('retries network failures and server errors, at most twice', () => {
    expect(shouldRetry(0, ApiError.network())).toBe(true);
    expect(shouldRetry(1, new ApiError(503, 'Unavailable'))).toBe(true);
    expect(shouldRetry(2, new ApiError(503, 'Unavailable'))).toBe(false);
  });

  it.each([400, 401, 403, 404, 409, 422, 429])('never retries %i', (status) => {
    expect(shouldRetry(0, new ApiError(status, 'x'))).toBe(false);
  });

  it('does not retry unknown errors (bugs)', () => {
    expect(shouldRetry(0, new TypeError('x is undefined'))).toBe(false);
  });
});

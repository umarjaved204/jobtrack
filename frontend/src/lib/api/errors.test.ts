import { describe, expect, it } from 'vitest';

import { ApiError, parseRetryAfter } from './errors';

const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

describe('ApiError.fromResponse', () => {
  it('uses the backend detail string', async () => {
    const error = await ApiError.fromResponse(
      response(409, { detail: 'An account with this email already exists' }),
    );
    expect(error).toMatchObject({
      status: 409,
      detail: 'An account with this email already exists',
      fieldErrors: {},
      retryAfterSeconds: null,
    });
  });

  it('maps FastAPI 422 validation errors to body fields', async () => {
    const error = await ApiError.fromResponse(
      response(422, {
        detail: [
          { loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'x' },
          { loc: ['body', 'password'], msg: 'String should have at least 8 characters' },
          { loc: ['body', 'password'], msg: 'second message is ignored' },
          { loc: ['query', 'page'], msg: 'not a body field' },
          'garbage',
        ],
      }),
    );
    expect(error.status).toBe(422);
    expect(error.detail).toBe('Please check the highlighted fields.');
    expect(error.fieldErrors).toEqual({
      email: 'value is not a valid email address',
      password: 'String should have at least 8 characters',
    });
  });

  it('reads Retry-After on 429', async () => {
    const error = await ApiError.fromResponse(
      response(
        429,
        { detail: 'Too many attempts, please try again later' },
        { 'Retry-After': '42' },
      ),
    );
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.detail).toBe('Too many attempts, please try again later');
  });

  it('falls back to a readable message for non-JSON bodies', async () => {
    const error = await ApiError.fromResponse(response(500, '<html>Internal error</html>'));
    expect(error.status).toBe(500);
    expect(error.detail).toBe('Something went wrong. Please try again.');
  });

  it.each([502, 503, 504])(
    'treats a bare %i from a proxy as "server unreachable" (API not running)',
    async (status) => {
      // What Vite's dev proxy returns when the backend is down: no JSON detail.
      const error = await ApiError.fromResponse(response(status, ''));
      expect(error.status).toBe(status);
      expect(error.detail).toBe(ApiError.network().detail);
    },
  );

  it('keeps the API’s own message when a 503 has one', async () => {
    const error = await ApiError.fromResponse(
      response(503, { detail: 'Database unavailable, try again shortly' }),
    );
    expect(error.detail).toBe('Database unavailable, try again shortly');
  });
});

describe('parseRetryAfter', () => {
  it('accepts delta-seconds and HTTP dates', () => {
    const now = Date.parse('2026-11-17T12:00:00Z');
    expect(parseRetryAfter('120', now)).toBe(120);
    expect(parseRetryAfter('Tue, 17 Nov 2026 12:00:30 GMT', now)).toBe(30);
    expect(parseRetryAfter('Tue, 17 Nov 2026 11:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

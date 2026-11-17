import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { formatWait, useCountdown } from '@/hooks/use-countdown';
import { ApiError } from '@/lib/api/errors';

import { applyServerError } from './form-errors';

describe('FormField', () => {
  it('links label, hint and error to the control', () => {
    render(
      <FormField label="Salary (min)" description="Annual, before tax" error="Must be a number">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Salary (min)');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Annual, before tax Must be a number');
  });

  it('is plain when there is nothing to describe', () => {
    render(
      <FormField label="Company">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Company');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('applyServerError', () => {
  const fields = ['email', 'password'] as const;

  it('puts 422 messages on known fields and focuses the first', () => {
    const setError = vi.fn();
    const outcome = applyServerError(
      new ApiError(422, 'Please check the highlighted fields.', {
        fieldErrors: { password: 'Too long', email: 'Bad email', other: 'ignored' },
      }),
      setError,
      fields,
    );
    expect(outcome).toEqual({ message: null, retryAfterSeconds: null });
    expect(setError).toHaveBeenCalledWith(
      'email',
      { type: 'server', message: 'Bad email' },
      { shouldFocus: true },
    );
    expect(setError).toHaveBeenCalledWith(
      'password',
      { type: 'server', message: 'Too long' },
      { shouldFocus: false },
    );
  });

  it('falls back to a form message when a 422 has no known field', () => {
    const outcome = applyServerError(
      new ApiError(422, 'Please check the highlighted fields.', { fieldErrors: { x: 'y' } }),
      vi.fn(),
      fields,
    );
    expect(outcome.message).toBe('Please check the highlighted fields.');
  });

  it('turns 429 into a wait (default 60 s without Retry-After)', () => {
    expect(applyServerError(new ApiError(429, 'Slow down'), vi.fn(), fields)).toEqual({
      message: 'Slow down',
      retryAfterSeconds: 60,
    });
  });

  it('never leaks raw errors', () => {
    expect(applyServerError(new TypeError('x'), vi.fn(), fields).message).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts whole seconds down to zero', () => {
    const { result } = renderHook(() => useCountdown());
    act(() => result.current.start(3));
    expect(result.current).toMatchObject({ remaining: 3, isRunning: true });

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toMatchObject({ remaining: 0, isRunning: false });
  });

  it('formats waits for people', () => {
    expect(formatWait(1)).toBe('1 second');
    expect(formatWait(42)).toBe('42 seconds');
    expect(formatWait(60)).toBe('1 minute');
    expect(formatWait(61)).toBe('2 minutes');
  });
});

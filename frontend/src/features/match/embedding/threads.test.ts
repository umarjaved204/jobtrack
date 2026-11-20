import { describe, expect, it } from 'vitest';

import { MAX_THREADS, wasmThreads } from './threads';

describe('wasmThreads', () => {
  it('uses one thread when the page isn’t cross-origin isolated', () => {
    expect(wasmThreads(false, 12)).toBe(1);
    expect(wasmThreads(false, 12, 4)).toBe(1);
  });

  it('uses one per logical CPU, capped at 4', () => {
    expect(MAX_THREADS).toBe(4);
    expect(wasmThreads(true, 12)).toBe(4);
    expect(wasmThreads(true, 2)).toBe(2);
    expect(wasmThreads(true, 1)).toBe(1);
  });

  it('copes with a browser that doesn’t report CPUs', () => {
    expect(wasmThreads(true, undefined)).toBe(1);
    expect(wasmThreads(true, 0)).toBe(1);
    expect(wasmThreads(true, Number.NaN)).toBe(1);
  });

  it('lets a request lower the count but never raise it', () => {
    expect(wasmThreads(true, 12, 1)).toBe(1);
    expect(wasmThreads(true, 12, 2)).toBe(2);
    expect(wasmThreads(true, 12, 16)).toBe(4);
    expect(wasmThreads(true, 12, 0)).toBe(1);
    expect(wasmThreads(true, 12, Number.NaN)).toBe(4);
  });
});

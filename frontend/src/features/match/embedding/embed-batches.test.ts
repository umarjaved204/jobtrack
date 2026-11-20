import { describe, expect, it } from 'vitest';

import { batchOrder, classifyError, clsVectors, DownloadTracker, placeRows } from './embed-batches';
import { checkSupport } from './support';

describe('batchOrder', () => {
  it('groups texts by length, shortest first', () => {
    expect(batchOrder(['long text', 'a', 'mid', 'bb'], 2)).toEqual([
      [1, 3],
      [2, 0],
    ]);
  });

  it('treats batch sizes below 1 as 1', () => {
    expect(batchOrder(['a', 'b'], 0)).toEqual([[0], [1]]);
  });
});

describe('clsVectors', () => {
  it('takes each row’s first token and normalises it', () => {
    // batch 2, sequence 2, dim 2: [[cls, tok], [cls, tok]]
    const hidden = new Float32Array([3, 4, 9, 9, 0, 2, 9, 9]);
    expect(Array.from(clsVectors(hidden, [2, 2, 2]))).toEqual([
      expect.closeTo(0.6),
      expect.closeTo(0.8),
      0,
      1,
    ]);
  });

  it('leaves an all-zero vector at zero', () => {
    expect(Array.from(clsVectors(new Float32Array(2), [1, 1, 2]))).toEqual([0, 0]);
  });

  it('refuses a shape that doesn’t match the data', () => {
    expect(() => clsVectors(new Float32Array(4), [1, 3, 2])).toThrow('Unexpected hidden state');
  });
});

describe('placeRows', () => {
  it('writes each row back to its original index', () => {
    const out = new Float32Array(6);
    placeRows(out, [2, 0], new Float32Array([5, 6, 1, 2]), 2);
    expect(Array.from(out)).toEqual([1, 2, 0, 0, 5, 6]);
  });

  it('refuses a result of the wrong size', () => {
    expect(() => placeRows(new Float32Array(4), [0, 1], new Float32Array(2), 2)).toThrow(
      'Expected 4 values, got 2',
    );
  });
});

describe('DownloadTracker', () => {
  it('sums bytes across files and ignores events without counts', () => {
    const tracker = new DownloadTracker();
    expect(tracker.update({ status: 'initiate', file: 'config.json' })).toBeNull();
    expect(tracker.update({ status: 'progress', file: 'a', loaded: 5, total: 10 })).toEqual({
      loaded: 5,
      total: 10,
    });
    expect(tracker.update({ status: 'progress', file: 'b', loaded: 1, total: 30 })).toEqual({
      loaded: 6,
      total: 40,
    });
    expect(tracker.update({ status: 'progress', file: 'a', loaded: 10, total: 10 })).toEqual({
      loaded: 11,
      total: 40,
    });
  });
});

describe('classifyError', () => {
  it.each([
    [new RangeError('WebAssembly.Memory(): could not allocate'), 'out-of-memory'],
    [new Error('failed to allocate a buffer of size 1024'), 'out-of-memory'],
    [new TypeError('Failed to fetch'), 'download-failed'],
    [new Error('Could not locate file: "onnx/model_quantized.onnx".'), 'download-failed'],
    [new Error('Unexpected input shape'), 'failed'],
    ['plain string', 'failed'],
  ])('%s is %s', (error, reason) => {
    expect(classifyError(error).reason).toBe(reason);
  });
});

describe('checkSupport', () => {
  const wasm = { validate: () => true } as unknown as typeof WebAssembly;
  const scope = (overrides: object) =>
    ({
      Worker: function Worker() {},
      WebAssembly: wasm,
      ...overrides,
    }) as unknown as typeof globalThis;

  it('accepts a browser with workers and SIMD WebAssembly', () => {
    expect(checkSupport(scope({}))).toBeNull();
  });

  it.each([
    [{ Worker: undefined }, 'no-worker'],
    [{ WebAssembly: undefined }, 'no-wasm'],
    [{ WebAssembly: { validate: () => false } }, 'no-simd'],
    [
      {
        WebAssembly: {
          validate: () => {
            throw new Error('blocked');
          },
        },
      },
      'no-simd',
    ],
  ])('reports %o as %s', (overrides, reason) => {
    expect(checkSupport(scope(overrides))).toBe(reason);
  });

  it('the SIMD probe is valid WebAssembly here (Node has SIMD)', () => {
    expect(checkSupport(scope({ WebAssembly }))).toBeNull();
  });
});

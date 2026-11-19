import { describe, expect, it } from 'vitest';

import { decodeVectors, encodeVectors } from './encode-vectors';

describe('encodeVectors', () => {
  it('writes little-endian float32, row-major', () => {
    // 1.0 is 0x3f800000: bytes 00 00 80 3f in little-endian order.
    expect(encodeVectors([new Float32Array([1])], 1)).toBe(btoa('\x00\x00\x80\x3f'));
  });

  it('round-trips exactly, rows in order', () => {
    const rows = [new Float32Array([0.6, -0.8, 0]), new Float32Array([0, 1e-7, -1])];
    expect(decodeVectors(encodeVectors(rows, 3), 3)).toEqual(rows);
  });

  it('handles more data than one String.fromCharCode call takes', () => {
    const rows = Array.from({ length: 900 }, (_, r) => Float32Array.from({ length: 384 }, (_, i) => r + i / 384)); // prettier-ignore
    const decoded = decodeVectors(encodeVectors(rows, 384), 384);
    expect(decoded).toHaveLength(900);
    expect(decoded[899]).toEqual(rows[899]);
  });

  it('encodes no rows as an empty string', () => {
    expect(encodeVectors([], 384)).toBe('');
  });

  it('refuses a row of the wrong width', () => {
    expect(() => encodeVectors([new Float32Array(3)], 4)).toThrow(/Row 0 has 3 values/);
  });
});

/*
 * Can this browser run the embedding model? Checked before anything downloads, so an
 * unsupported device gets an explanation instead of a 34 MB download that then fails.
 */

// The smallest module using a SIMD instruction (the wasm-feature-detect "simd" probe).
// ONNX Runtime ships only SIMD builds of its WebAssembly runtime.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

export type Unsupported = 'no-worker' | 'no-wasm' | 'no-simd';

export function checkSupport(scope: typeof globalThis = globalThis): Unsupported | null {
  if (typeof scope.Worker !== 'function') return 'no-worker';
  if (typeof scope.WebAssembly !== 'object') return 'no-wasm';
  try {
    if (!scope.WebAssembly.validate(SIMD_PROBE)) return 'no-simd';
  } catch {
    return 'no-simd';
  }
  return null;
}

export const UNSUPPORTED_REASONS: Record<Unsupported, string> = {
  'no-worker': 'This browser can’t run background scripts (Web Workers).',
  'no-wasm': 'This browser has WebAssembly turned off or doesn’t support it.',
  'no-simd': 'This browser’s WebAssembly lacks SIMD, which the model needs.',
};

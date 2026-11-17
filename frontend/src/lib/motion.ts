/**
 * Motion tokens for JS animation (`motion/react` takes seconds and bezier arrays).
 * Mirrors `--duration-*` in src/styles/tokens.css and `--ease-*` in src/styles/index.css;
 * `tokens.contrast.test.ts` fails if the two drift apart.
 */
export const duration = {
  instant: 0.08,
  fast: 0.15,
  base: 0.24,
  slow: 0.4,
  slower: 0.64,
} as const;

export const ease = {
  outQuint: [0.22, 1, 0.36, 1],
  outExpo: [0.16, 1, 0.3, 1],
  inOutQuart: [0.76, 0, 0.24, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

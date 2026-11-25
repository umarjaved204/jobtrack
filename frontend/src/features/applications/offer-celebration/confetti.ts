/*
 * Paper confetti for the offer stamp: scraps of newsprint in the masthead's colours,
 * thrown up and out from behind the stamp, then falling and fading. Pure and seedable, so
 * the shape of the burst is tested and every piece's motion is decided up front.
 */

export type ConfettiPiece = {
  /** Where it lands, in px from the stamp's centre. */
  x: number;
  /** Highest point (negative: up) and where it ends, in px from the centre. */
  peak: number;
  fall: number;
  /** Degrees turned on the way. */
  spin: number;
  /** Seconds. */
  delay: number;
  duration: number;
  width: number;
  height: number;
  color: ConfettiColor;
};

/**
 * The broadsheet itself, torn up: the brand colour (follows the user's accent), the
 * secondary highlight, ink and paper. Theme tokens, so the burst suits light and dark.
 */
export const CONFETTI_COLORS = ['brand', 'highlight', 'ink', 'paper'] as const;
export type ConfettiColor = (typeof CONFETTI_COLORS)[number];

export const CONFETTI_COUNT = 42;

const between = (random: () => number, min: number, max: number) => min + random() * (max - min);

/** Small seeded generator (mulberry32), for tests and stories that want the same burst. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeConfetti(
  count = CONFETTI_COUNT,
  random: () => number = Math.random,
): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => {
    // Even spread around the stamp (left and right alternate), jittered.
    const side = i % 2 === 0 ? -1 : 1;
    const reach = between(random, 0.25, 1);
    // Strips (long and thin) and scraps (nearly square), like cut newsprint.
    const strip = random() < 0.4;
    return {
      x: Math.round(side * reach * 420),
      peak: Math.round(-between(random, 120, 300)),
      fall: Math.round(between(random, 160, 420)),
      spin: Math.round(side * between(random, 180, 720)),
      delay: Number(between(random, 0, 0.12).toFixed(3)),
      duration: Number(between(random, 1.3, 2.1).toFixed(3)),
      width: strip ? 4 : Math.round(between(random, 7, 11)),
      height: strip ? Math.round(between(random, 14, 20)) : Math.round(between(random, 6, 10)),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? 'brand',
    };
  });
}

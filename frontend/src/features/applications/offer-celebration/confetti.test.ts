import { describe, expect, it } from 'vitest';

import { CONFETTI_COLORS, CONFETTI_COUNT, makeConfetti, seededRandom } from './confetti';

describe('makeConfetti', () => {
  const pieces = makeConfetti(CONFETTI_COUNT, seededRandom(42));

  it('is the same burst for the same seed', () => {
    expect(makeConfetti(CONFETTI_COUNT, seededRandom(42))).toEqual(pieces);
    expect(makeConfetti(CONFETTI_COUNT, seededRandom(7))).not.toEqual(pieces);
  });

  it('throws evenly to both sides, up first and then down', () => {
    expect(pieces).toHaveLength(CONFETTI_COUNT);
    const left = pieces.filter((p) => p.x < 0).length;
    expect(left).toBe(CONFETTI_COUNT / 2);
    for (const p of pieces) {
      expect(Math.abs(p.x)).toBeGreaterThanOrEqual(0.25 * 420 - 1);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(420);
      expect(p.peak).toBeLessThan(0);
      expect(p.fall).toBeGreaterThan(0);
      // Spins the way it flies.
      expect(Math.sign(p.spin)).toBe(Math.sign(p.x));
    }
  });

  it('keeps the timing short and the scraps small', () => {
    for (const p of pieces) {
      expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.delay + p.duration).toBeLessThanOrEqual(2.25); // gone well inside the 2.6 s
      expect(p.width).toBeGreaterThanOrEqual(4);
      expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(20);
    }
  });

  it('uses every colour, in turn', () => {
    expect(pieces.slice(0, CONFETTI_COLORS.length).map((p) => p.color)).toEqual([
      ...CONFETTI_COLORS,
    ]);
  });
});

describe('seededRandom', () => {
  it('stays in [0, 1)', () => {
    const random = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const n = random();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

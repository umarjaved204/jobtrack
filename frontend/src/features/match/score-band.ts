/*
 * Words for a score. The cut-offs come from the labelled pairs (docs/architecture.md
 * "Match scoring"): every "the role" pair scored 67 or more, "overlapping role" pairs
 * 40–50, "related field" up to 39 and "different profession" up to 13.
 */

export type ScoreBand = 'strong' | 'partial' | 'little';

export const STRONG_FROM = 65;
export const PARTIAL_FROM = 35;

export function scoreBand(score: number): ScoreBand {
  if (score >= STRONG_FROM) return 'strong';
  if (score >= PARTIAL_FROM) return 'partial';
  return 'little';
}

export const BAND_LABELS: Record<ScoreBand, string> = {
  strong: 'Strong overlap',
  partial: 'Partial overlap',
  little: 'Little overlap',
};

/** 0.666 → "67%". */
export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

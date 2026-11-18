import type { Rate } from '@/types/analytics';

/** Below this many applications, a rate is shown muted and flagged: 1 of 1 isn't 100% of anything. */
export const MIN_SAMPLE = 5;

export const isSmallSample = (n: number) => n > 0 && n < MIN_SAMPLE;

const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });

/** "53%", or "—" when there was nothing to divide by. */
export function formatRate(rate: Rate): string {
  return rate === null ? '—' : percent.format(rate);
}

/** Share of the largest value, for bar widths (0 when there's nothing to compare). */
export function share(value: number, max: number): number {
  return max > 0 ? value / max : 0;
}

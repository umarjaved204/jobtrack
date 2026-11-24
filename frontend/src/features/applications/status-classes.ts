import type { ApplicationStatus } from '@/types/application';

/*
 * Square status dots (column headings, "Move to…" items). Full class strings so Tailwind's
 * scanner sees them; colours are the status ramp tokens.
 */
export const statusDotClass: Record<ApplicationStatus, string> = {
  wishlist: 'bg-status-wishlist',
  applied: 'bg-status-applied',
  screening: 'bg-status-screening',
  interview: 'bg-status-interview',
  offer: 'bg-status-offer',
  rejected: 'bg-status-rejected',
  withdrawn: 'bg-status-withdrawn',
};

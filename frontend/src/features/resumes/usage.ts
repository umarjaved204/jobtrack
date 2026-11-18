import type { ResumeSummary } from '@/types/resume';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Where a version has been used, as a sentence fragment: "sent with 3 applications",
 * "used in 1 match", both joined with "and", or null when unused.
 */
export function usageText(resume: Pick<ResumeSummary, 'application_count' | 'match_count'>) {
  const parts = [];
  if (resume.application_count) {
    parts.push(`sent with ${count(resume.application_count, 'application', 'applications')}`);
  }
  if (resume.match_count) parts.push(`used in ${count(resume.match_count, 'match', 'matches')}`);
  return parts.length ? parts.join(' and ') : null;
}

/** "Sent with 3 applications" (capitalised), or "Not sent yet". */
export function usageLabel(resume: Pick<ResumeSummary, 'application_count' | 'match_count'>) {
  const text = usageText(resume);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Not sent yet';
}

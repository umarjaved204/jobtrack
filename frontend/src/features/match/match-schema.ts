import { z } from 'zod';

import type { Match, MatchInput } from '@/types/match';

/*
 * Mirrors backend/app/schemas/match.py: the JD is counted after the same normalisation
 * the server applies, so the counter and the server agree.
 */

export const MAX_JD_CHARS = 20_000;
/** Radix Select can't hold an empty value: this stands for "not linked". */
export const NO_APPLICATION = 'none';

export function normaliseJdText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replaceAll('\0', '').trim();
}

export const matchFormSchema = z.object({
  resume_id: z.string().min(1, 'Pick the resume to match'),
  application_id: z.string(),
  jd_text: z
    .string()
    .refine((v) => normaliseJdText(v).length > 0, 'Paste the job description')
    .refine(
      (v) => normaliseJdText(v).length <= MAX_JD_CHARS,
      `Job descriptions can be up to ${MAX_JD_CHARS.toLocaleString('en-GB')} characters`,
    ),
});

export type MatchFormValues = z.input<typeof matchFormSchema>;
export const matchFields = Object.keys(matchFormSchema.shape) as (keyof MatchFormValues)[];

export function toMatchInput(values: MatchFormValues): MatchInput {
  return {
    resume_id: values.resume_id,
    jd_text: normaliseJdText(values.jd_text),
    application_id: values.application_id === NO_APPLICATION ? null : values.application_id,
  };
}

/*
 * "Run again": the detail page opens the match page with the old inputs in the
 * navigation state. State can hold anything (an old history entry), so it's parsed.
 */
const rerunSchema = z.object({
  rerun: z.object({
    resume_id: z.string(),
    application_id: z.string().nullable(),
    jd_text: z.string(),
  }),
});

export function rerunState(match: Pick<Match, 'resume_version_id' | 'application_id' | 'jd_text'>) {
  return {
    rerun: {
      resume_id: match.resume_version_id,
      application_id: match.application_id,
      jd_text: match.jd_text,
    },
  };
}

/** The form's starting values from navigation state, or null if there's no re-run. */
export function rerunValues(state: unknown): MatchFormValues | null {
  const parsed = rerunSchema.safeParse(state);
  if (!parsed.success) return null;
  const { resume_id, application_id, jd_text } = parsed.data.rerun;
  return { resume_id, application_id: application_id ?? NO_APPLICATION, jd_text };
}

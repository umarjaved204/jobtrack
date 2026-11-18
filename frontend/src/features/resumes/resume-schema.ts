import { z } from 'zod';

import type { Resume, ResumeInput, ResumePatch } from '@/types/resume';

/*
 * Mirrors backend/app/schemas/resume.py. The limit is counted on the normalised text,
 * exactly as the server counts it, so the counter and the server always agree.
 */

export const MAX_RESUME_CHARS = 50_000;
export const MAX_LABEL_CHARS = 100;

/** One line-ending style, no NUL characters, no surrounding blank space. */
export function normaliseResumeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replaceAll('\0', '').trim();
}

export const resumeFormSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Name this version, like “Frontend, product focus”')
    .max(MAX_LABEL_CHARS, `Keep it under ${MAX_LABEL_CHARS} characters`),
  content_text: z
    .string()
    .refine((v) => normaliseResumeText(v).length > 0, 'Paste the resume text')
    .refine(
      (v) => normaliseResumeText(v).length <= MAX_RESUME_CHARS,
      `Resumes can be up to ${MAX_RESUME_CHARS.toLocaleString('en-GB')} characters`,
    ),
  is_default: z.boolean(),
});

export type ResumeFormValues = z.input<typeof resumeFormSchema>;
export const resumeFields = Object.keys(resumeFormSchema.shape) as (keyof ResumeFormValues)[];

export function resumeFormValues(resume?: Resume): ResumeFormValues {
  return {
    label: resume?.label ?? '',
    content_text: resume?.content_text ?? '',
    is_default: resume?.is_default ?? false,
  };
}

/** "Duplicate as new version": same text, a label that says it's a copy. */
export function duplicateValues(resume: Resume): ResumeFormValues {
  const suffix = ' (copy)';
  return {
    label: resume.label.slice(0, MAX_LABEL_CHARS - suffix.length) + suffix,
    content_text: resume.content_text,
    is_default: false,
  };
}

export function toResumeInput(values: ResumeFormValues): ResumeInput {
  return {
    label: values.label.trim(),
    content_text: normaliseResumeText(values.content_text),
    is_default: values.is_default,
  };
}

/** Only what changed. The default flag is changed from the page, not the form. */
export function toResumePatch(
  values: ResumeFormValues,
  changed: Partial<Record<keyof ResumeFormValues, unknown>>,
): ResumePatch {
  const patch: ResumePatch = {};
  if (changed.label) patch.label = values.label.trim();
  if (changed.content_text) patch.content_text = normaliseResumeText(values.content_text);
  return patch;
}

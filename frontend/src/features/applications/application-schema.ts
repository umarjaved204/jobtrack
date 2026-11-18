import { z } from 'zod';

import { isDateOnly } from '@/lib/dates';
import {
  type Application,
  type ApplicationInput,
  type ApplicationPatch,
  applicationStatuses,
  workModes,
} from '@/types/application';

import { MAX_TAGS } from './tag-picker';

/*
 * The application form works on strings (what inputs produce) and converts to the API's
 * shape on submit. Rules mirror backend/app/schemas/application.py; the server stays the
 * authority, and anything it still rejects comes back as a 422 shown on the field.
 */

export const SALARY_MAX = 100_000_000; // Salary: ge=0, le=100_000_000
/** The resume picker's "none" value (Radix Select items can't have an empty value). */
export const NO_RESUME = 'none';
const URL_MAX = 2048; // job_url column

/** "75,000" / "75 000" → "75000". */
const digitsOnly = (value: string) => value.replace(/[\s,]/g, '');

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const requiredText = (missing: string) =>
  z.string().trim().min(1, missing).max(200, 'Keep it under 200 characters');

const salary = z
  .string()
  .trim()
  .refine((v) => !v || /^\d+$/.test(digitsOnly(v)), 'Use whole numbers, like 75000')
  .refine(
    // Only judge the size of things that are numbers (Zod runs every refinement).
    (v) => !/^\d+$/.test(digitsOnly(v)) || Number(digitsOnly(v)) <= SALARY_MAX,
    `That’s above ${SALARY_MAX.toLocaleString('en-GB')}`,
  );

const dateOnly = z.string().refine((v) => !v || isDateOnly(v), 'Enter a valid date');

export const applicationFormSchema = z
  .object({
    company: requiredText('Enter the company'),
    role_title: requiredText('Enter the role'),
    location: z.string().trim().max(200, 'Keep it under 200 characters'),
    work_mode: z.enum(['none', ...workModes]),
    job_url: z
      .string()
      .trim()
      .max(URL_MAX, `Links can be at most ${URL_MAX} characters`)
      .refine((v) => !v || isHttpUrl(v), 'Enter the full link, starting with https://'),
    salary_min: salary,
    salary_max: salary,
    salary_currency: z
      .string()
      .trim()
      .refine((v) => !v || /^[A-Za-z]{3}$/.test(v), 'Use a 3-letter code, like GBP'),
    source: z.string().trim().max(50, 'Keep it under 50 characters'),
    status: z.enum(applicationStatuses),
    applied_on: dateOnly,
    deadline_on: dateOnly,
    /** A resume version id, or NO_RESUME. */
    resume_version_id: z.string(),
    tag_ids: z.array(z.string()).max(MAX_TAGS, `Up to ${MAX_TAGS} tags`),
  })
  .superRefine((values, ctx) => {
    const min = values.salary_min ? Number(digitsOnly(values.salary_min)) : null;
    const max = values.salary_max ? Number(digitsOnly(values.salary_max)) : null;
    if (min !== null && max !== null && min > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['salary_max'],
        message: 'The maximum can’t be below the minimum',
      });
    }
  });

export type ApplicationFormValues = z.input<typeof applicationFormSchema>;

/** Form values for a new application (optionally starting in a given column). */
export function emptyFormValues(
  status: ApplicationFormValues['status'] = 'wishlist',
): ApplicationFormValues {
  return {
    company: '',
    role_title: '',
    location: '',
    work_mode: 'none',
    job_url: '',
    salary_min: '',
    salary_max: '',
    salary_currency: '',
    source: '',
    status,
    applied_on: '',
    deadline_on: '',
    resume_version_id: NO_RESUME,
    tag_ids: [],
  };
}

/** Form values for editing an existing application. */
export function formValuesFrom(application: Application): ApplicationFormValues {
  return {
    company: application.company,
    role_title: application.role_title,
    location: application.location ?? '',
    work_mode: application.work_mode ?? 'none',
    job_url: application.job_url ?? '',
    salary_min: application.salary_min?.toString() ?? '',
    salary_max: application.salary_max?.toString() ?? '',
    salary_currency: application.salary_currency ?? '',
    source: application.source ?? '',
    status: application.status,
    applied_on: application.applied_on ?? '',
    deadline_on: application.deadline_on ?? '',
    resume_version_id: application.resume_version_id ?? NO_RESUME,
    tag_ids: application.tags.map((t) => t.id),
  };
}

const textOrNull = (value: string) => value.trim() || null;
const salaryOrNull = (value: string) => (value.trim() ? Number(digitsOnly(value)) : null);

/** Each form field → its API value ("" → null, salaries → numbers, currency upper-cased). */
const convert: { [K in keyof ApplicationFormValues]-?: (v: ApplicationFormValues[K]) => unknown } =
  {
    company: (v) => v.trim(),
    role_title: (v) => v.trim(),
    location: textOrNull,
    work_mode: (v) => (v === 'none' ? null : v),
    job_url: textOrNull,
    salary_min: salaryOrNull,
    salary_max: salaryOrNull,
    salary_currency: (v) => textOrNull(v)?.toUpperCase() ?? null,
    source: textOrNull,
    status: (v) => v,
    applied_on: (v) => v || null,
    deadline_on: (v) => v || null,
    resume_version_id: (v) => (v === NO_RESUME ? null : v),
    tag_ids: (v) => v,
  };

export function toApplicationInput(values: ApplicationFormValues): ApplicationInput {
  const entries = Object.entries(convert).map(([key, fn]) => [
    key,
    (fn as (v: unknown) => unknown)(values[key as keyof ApplicationFormValues]),
  ]);
  return Object.fromEntries(entries) as ApplicationInput;
}

/**
 * PATCH body with only the fields the user changed (the API leaves the rest untouched).
 * `changed` is React Hook Form's dirty-field map (arrays report per item, so any truthy
 * entry counts).
 */
export function toApplicationPatch(
  values: ApplicationFormValues,
  changed: Partial<Record<keyof ApplicationFormValues, unknown>>,
): ApplicationPatch {
  const full = toApplicationInput(values) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(convert) as (keyof ApplicationFormValues)[]) {
    const flag = changed[key];
    if (Array.isArray(flag) ? flag.some(Boolean) : Boolean(flag)) patch[key] = full[key];
  }
  return patch as ApplicationPatch;
}

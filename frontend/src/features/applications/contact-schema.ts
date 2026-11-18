import { z } from 'zod';

import type { Contact, ContactInput } from '@/types/application';

import { isHttpUrl } from './application-schema';

/*
 * The contact form (strings in, API shape out). Limits mirror backend/app/schemas/contact.py.
 * Only the name is required. On edit, only changed fields are sent, and emptying a field
 * sends null, which clears it (the API's PATCH semantics).
 */

const optional = (max: number, message: string) => z.string().trim().max(max, message);

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter their name').max(120, 'Keep it under 120 characters'),
  role: optional(120, 'Keep it under 120 characters'),
  email: optional(320, 'Keep it under 320 characters').refine(
    (v) => !v || z.email().safeParse(v).success,
    'Enter an email address, like name@company.com',
  ),
  phone: optional(40, 'Keep it under 40 characters'),
  linkedin_url: optional(2048, 'Links can be at most 2048 characters').refine(
    (v) => !v || isHttpUrl(v),
    'Enter the full link, starting with https://',
  ),
  notes: optional(5000, 'Keep notes under 5000 characters'),
});

export type ContactFormValues = z.input<typeof contactFormSchema>;
export const contactFields = Object.keys(contactFormSchema.shape) as (keyof ContactFormValues)[];

export function contactFormValues(contact?: Contact): ContactFormValues {
  return {
    name: contact?.name ?? '',
    role: contact?.role ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    linkedin_url: contact?.linkedin_url ?? '',
    notes: contact?.notes ?? '',
  };
}

export function toContactInput(values: ContactFormValues): ContactInput {
  const text = (v: string) => v.trim() || null;
  return {
    name: values.name.trim(),
    role: text(values.role),
    email: text(values.email),
    phone: text(values.phone),
    linkedin_url: text(values.linkedin_url),
    notes: text(values.notes),
  };
}

/** Only the fields the user changed (React Hook Form's dirty map); "" becomes null. */
export function toContactPatch(
  values: ContactFormValues,
  changed: Partial<Record<keyof ContactFormValues, boolean | undefined>>,
): Partial<ContactInput> {
  const full = toContactInput(values);
  return Object.fromEntries(contactFields.filter((key) => changed[key]).map((k) => [k, full[k]]));
}

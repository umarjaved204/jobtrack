import { describe, expect, it } from 'vitest';

import {
  contactFormSchema,
  contactFormValues,
  toContactInput,
  toContactPatch,
} from './contact-schema';

const valid = { ...contactFormValues(), name: 'Priya Shah' };
const errorFor = (patch: Partial<typeof valid>) => {
  const result = contactFormSchema.safeParse({ ...valid, ...patch });
  return result.success ? null : result.error.issues[0]?.message;
};

describe('contact form schema', () => {
  it('needs only a name', () => {
    expect(errorFor({})).toBeNull();
    expect(errorFor({ name: '   ' })).toBe('Enter their name');
  });

  it('checks email and profile link formats, ignoring them when empty', () => {
    expect(errorFor({ email: 'priya@' })).toMatch(/email address/);
    expect(errorFor({ email: 'priya@monzo.com' })).toBeNull();
    expect(errorFor({ linkedin_url: 'linkedin.com/in/priya' })).toMatch(/https:\/\//);
    expect(errorFor({ linkedin_url: 'https://lnkd.in/abc' })).toBeNull();
  });

  it('applies the API’s length limits', () => {
    expect(errorFor({ name: 'x'.repeat(121) })).toMatch(/120/);
    expect(errorFor({ phone: '1'.repeat(41) })).toMatch(/40/);
    expect(errorFor({ notes: 'x'.repeat(5001) })).toMatch(/5000/);
  });
});

describe('contact conversion', () => {
  it('trims, and sends empty fields as null', () => {
    expect(toContactInput({ ...valid, name: ' Priya Shah ', role: ' Recruiter ' })).toEqual({
      name: 'Priya Shah',
      role: 'Recruiter',
      email: null,
      phone: null,
      linkedin_url: null,
      notes: null,
    });
  });

  it('patches only changed fields; emptying one clears it', () => {
    expect(
      toContactPatch({ ...valid, role: 'Hiring manager', phone: '' }, { role: true, phone: true }),
    ).toEqual({ role: 'Hiring manager', phone: null });
    expect(toContactPatch(valid, {})).toEqual({});
  });
});

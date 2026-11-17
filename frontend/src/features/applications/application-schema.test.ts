import { describe, expect, it } from 'vitest';

import { makeApplication } from '@/test/fake-applications';

import {
  applicationFormSchema,
  emptyFormValues,
  formValuesFrom,
  toApplicationInput,
  toApplicationPatch,
} from './application-schema';

const valid = {
  ...emptyFormValues('applied'),
  company: '  Monzo ',
  role_title: 'Senior Frontend Engineer',
};

const errors = (values: object) => {
  const result = applicationFormSchema.safeParse(values);
  return Object.fromEntries(result.error?.issues.map((i) => [i.path.join('.'), i.message]) ?? []);
};

describe('applicationFormSchema (mirrors the backend)', () => {
  it('needs only a company and a role', () => {
    expect(errors(valid)).toEqual({});
    expect(errors(emptyFormValues())).toEqual({
      company: 'Enter the company',
      role_title: 'Enter the role',
    });
  });

  it.each([
    [{ company: 'c'.repeat(201) }, 'company', 'Keep it under 200 characters'],
    [{ source: 's'.repeat(51) }, 'source', 'Keep it under 50 characters'],
    [{ job_url: 'monzo.com/careers' }, 'job_url', 'Enter the full link, starting with https://'],
    [{ job_url: 'javascript:alert(1)' }, 'job_url', 'Enter the full link, starting with https://'],
    [{ salary_min: '75k' }, 'salary_min', 'Use whole numbers, like 75000'],
    [{ salary_min: '-1' }, 'salary_min', 'Use whole numbers, like 75000'],
    [{ salary_min: '100000001' }, 'salary_min', 'That’s above 100,000,000'],
    [{ salary_currency: 'pounds' }, 'salary_currency', 'Use a 3-letter code, like GBP'],
    [{ applied_on: '2026-02-30' }, 'applied_on', 'Enter a valid date'],
    [{ salary_min: '90000', salary_max: '75000' }, 'salary_max', 'The maximum can’t be below the minimum'],
  ])('rejects %j', (override, field, message) => {
    expect(errors({ ...valid, ...override })).toEqual({ [field]: message });
  }); // prettier-ignore

  it('accepts the edges and friendly formats', () => {
    expect(
      errors({
        ...valid,
        company: 'c'.repeat(200),
        salary_min: '75,000',
        salary_max: '90 000',
        salary_currency: 'gbp',
        job_url: 'http://jobs.example.org/monzo/1',
        applied_on: '2024-02-29',
      }),
    ).toEqual({});
  });
});

describe('toApplicationInput', () => {
  it('converts to the API shape: trims, empties become null, salaries become numbers', () => {
    expect(
      toApplicationInput({
        ...valid,
        location: '  ',
        work_mode: 'hybrid',
        salary_min: '75,000',
        salary_max: '',
        salary_currency: 'gbp',
        applied_on: '2026-11-03',
        tag_ids: ['tag-remote'],
      }),
    ).toEqual({
      company: 'Monzo',
      role_title: 'Senior Frontend Engineer',
      location: null,
      work_mode: 'hybrid',
      job_url: null,
      salary_min: 75000,
      salary_max: null,
      salary_currency: 'GBP',
      source: null,
      status: 'applied',
      applied_on: '2026-11-03', // a date-only string, never a Date
      deadline_on: null,
      tag_ids: ['tag-remote'],
    });
  });
});

describe('toApplicationPatch', () => {
  const application = makeApplication({
    location: 'London',
    tags: [{ id: 'tag-remote', name: 'Remote', color: 'cobalt' }],
  });

  it('round-trips an existing application through the form unchanged', () => {
    const values = formValuesFrom(application);
    expect(toApplicationPatch(values, {})).toEqual({});
    expect(values.applied_on).toBe(application.applied_on);
  });

  it('sends only the changed fields, with null to clear', () => {
    const values = { ...formValuesFrom(application), location: '', source: 'Referral' };
    expect(toApplicationPatch(values, { location: true, source: true })).toEqual({
      location: null,
      source: 'Referral',
    });
  });

  it('sends the whole tag list when any tag changed', () => {
    const values = { ...formValuesFrom(application), tag_ids: ['tag-remote', 'tag-fintech'] };
    expect(toApplicationPatch(values, { tag_ids: [false, true] })).toEqual({
      tag_ids: ['tag-remote', 'tag-fintech'],
    });
  });
});

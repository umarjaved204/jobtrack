import { describe, expect, it } from 'vitest';

import {
  linkedValues,
  MAX_JD_CHARS,
  matchFormSchema,
  matchLinkFor,
  NO_APPLICATION,
  toMatchInput,
} from './match-schema';

const valid = { resume_id: 'resume-1', application_id: NO_APPLICATION, jd_text: 'React engineer' };
const errorsFor = (values: object) =>
  matchFormSchema.safeParse({ ...valid, ...values }).error?.issues.map((i) => i.message);

describe('matchFormSchema', () => {
  it('needs a resume and a job description', () => {
    expect(errorsFor({ resume_id: '' })).toEqual(['Pick the resume to match']);
    expect(errorsFor({ jd_text: ' \r\n ' })).toEqual(['Paste the job description']);
  });

  it('counts the JD after normalising it, like the server', () => {
    // CRLF counts as one character: (limit - 2) + "\n" + "b" is exactly the limit.
    const atLimit = `${'a'.repeat(MAX_JD_CHARS - 2)}\r\nb`;
    expect(errorsFor({ jd_text: atLimit })).toBeUndefined();
    expect(errorsFor({ jd_text: `${atLimit}c` })).toEqual([
      'Job descriptions can be up to 20,000 characters',
    ]);
  });
});

describe('toMatchInput', () => {
  it('normalises the JD and turns "not linked" into null', () => {
    expect(toMatchInput({ ...valid, jd_text: '  Role\r\n- React\0  ' })).toEqual({
      resume_id: 'resume-1',
      jd_text: 'Role\n- React',
      application_id: null,
    });
    expect(toMatchInput({ ...valid, application_id: 'app-1' }).application_id).toBe('app-1');
  });
});

describe('matchLinkFor / linkedValues', () => {
  it('round-trips an application id through the URL', () => {
    const link = matchLinkFor('app-monzo');
    expect(link).toBe('/match?application=app-monzo');
    expect(linkedValues(new URL(link, 'https://jobtrack.local').searchParams)).toEqual({
      resume_id: '',
      application_id: 'app-monzo',
      jd_text: '',
    });
  });

  it('ignores a missing, empty or "not linked" value', () => {
    for (const search of [
      '',
      '?application=',
      '?application=%20',
      `?application=${NO_APPLICATION}`,
    ]) {
      expect(linkedValues(new URLSearchParams(search))).toBeNull();
    }
  });
});

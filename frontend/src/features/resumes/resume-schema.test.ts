import { describe, expect, it } from 'vitest';

import type { Resume } from '@/types/resume';

import {
  duplicateValues,
  MAX_RESUME_CHARS,
  normaliseResumeText,
  resumeFormSchema,
  toResumeInput,
  toResumePatch,
} from './resume-schema';

const resume: Resume = {
  id: 'r1',
  label: 'Frontend v3 (product)',
  content_text: 'Sam Okafor\nFrontend engineer',
  is_default: true,
  archived_at: null,
  char_count: 28,
  application_count: 4,
  match_count: 0,
  created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-10-01T09:00:00Z',
};

const valid = (content_text: string) =>
  resumeFormSchema.safeParse({ label: 'v1', content_text, is_default: false }).success;

describe('normaliseResumeText', () => {
  it('matches the server: one line ending, no NULs, trimmed', () => {
    expect(normaliseResumeText('\r\n  Sam\r\nOkafor\rLondon\0 \n\n')).toBe('Sam\nOkafor\nLondon');
  });
});

describe('resumeFormSchema', () => {
  it('counts the limit on the normalised text, like the server', () => {
    expect(valid('a'.repeat(MAX_RESUME_CHARS))).toBe(true);
    expect(valid('a'.repeat(MAX_RESUME_CHARS + 1))).toBe(false);
    // 16,666 × "ab\r\n" is 66,664 characters as typed but 49,998 once CRLF becomes LF.
    expect(valid('ab\r\n'.repeat(16_666))).toBe(true);
    expect(valid('  \r\n ')).toBe(false);
  });

  it('needs a label of at most 100 characters', () => {
    const parse = (label: string) =>
      resumeFormSchema.safeParse({ label, content_text: 'x', is_default: false }).success;
    expect(parse('   ')).toBe(false);
    expect(parse('a'.repeat(100))).toBe(true);
    expect(parse('a'.repeat(101))).toBe(false);
  });
});

describe('conversions', () => {
  it('sends normalised values on create', () => {
    expect(
      toResumeInput({ label: ' Data v1 ', content_text: 'SQL\r\ndbt\r\n', is_default: true }),
    ).toEqual({ label: 'Data v1', content_text: 'SQL\ndbt', is_default: true });
  });

  it('patches only what changed', () => {
    const values = { label: 'Renamed', content_text: 'Same', is_default: true };
    expect(toResumePatch(values, { label: true })).toEqual({ label: 'Renamed' });
    expect(toResumePatch(values, {})).toEqual({});
  });

  it('duplicates as a non-default copy within the label limit', () => {
    expect(duplicateValues(resume)).toEqual({
      label: 'Frontend v3 (product) (copy)',
      content_text: resume.content_text,
      is_default: false,
    });
    const long = duplicateValues({ ...resume, label: 'x'.repeat(100) });
    expect(long.label).toHaveLength(100);
    expect(long.label.endsWith(' (copy)')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { loginSchema, registerSchema } from './schemas';

const issues = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => Object.fromEntries(result.error?.issues.map((i) => [i.path.join('.'), i.message]) ?? []);

describe('loginSchema', () => {
  it('accepts valid credentials and trims the email', () => {
    expect(loginSchema.parse({ email: '  sam.okafor@example.com ', password: 'x' })).toEqual({
      email: 'sam.okafor@example.com',
      password: 'x',
    });
  });

  it('explains what is missing', () => {
    expect(issues(loginSchema.safeParse({ email: '', password: '' }))).toEqual({
      email: 'Enter your email address',
      password: 'Enter your password',
    });
    expect(issues(loginSchema.safeParse({ email: 'sam@', password: 'x' }))).toEqual({
      email: 'Enter a valid email address, like name@example.com',
    });
  });
});

describe('registerSchema (mirrors the backend limits)', () => {
  const valid = {
    full_name: 'Amara Nwosu',
    email: 'amara.nwosu@example.com',
    password: 'eight888',
  };

  it('accepts the boundaries: 8 and 128-character passwords, 120-character names', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, password: 'p'.repeat(128) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, full_name: 'n'.repeat(120) }).success).toBe(true);
  });

  it('rejects just outside them', () => {
    expect(issues(registerSchema.safeParse({ ...valid, password: 'seven77' }))).toEqual({
      password: 'Use at least 8 characters',
    });
    expect(issues(registerSchema.safeParse({ ...valid, password: 'p'.repeat(129) }))).toEqual({
      password: 'Use at most 128 characters',
    });
    expect(issues(registerSchema.safeParse({ ...valid, full_name: 'n'.repeat(121) }))).toEqual({
      full_name: 'Keep it under 120 characters',
    });
  });

  it('treats a whitespace-only name as empty (the backend strips it)', () => {
    expect(issues(registerSchema.safeParse({ ...valid, full_name: '   ' }))).toEqual({
      full_name: 'Enter your name',
    });
  });
});

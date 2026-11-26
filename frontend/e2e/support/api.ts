// Test data set up through the real API, as the browser context. A context's `request`
// shares its cookie jar, so registering here leaves the httpOnly refresh cookie in the
// browser: the next page load restores the session exactly as it does for a real user.
import { type BrowserContext, expect } from '@playwright/test';

import { BASE_URL } from './env.ts';

export interface TestUser {
  email: string;
  password: string;
  fullName: string;
}

export interface SignedInUser extends TestUser {
  accessToken: string;
}

/** A user no other test (or retry) has used: the e2e database lives for a whole run. */
export function newUser(fullName = 'Priya Raman'): TestUser {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    // Any domain works: the e2e API turns the sign-up DNS check off.
    email: `e2e.${unique}@jobtrack-e2e.com`,
    password: 'e2e-password-2026',
    fullName,
  };
}

/** Register through the API and keep the session in `context`. */
export async function signUpViaApi(
  context: BrowserContext,
  user: TestUser = newUser(),
): Promise<SignedInUser> {
  const response = await context.request.post(`${BASE_URL}/api/v1/auth/register`, {
    data: { email: user.email, password: user.password, full_name: user.fullName },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { access_token: string };
  return { ...user, accessToken: body.access_token };
}

export interface CreatedResume {
  id: string;
  label: string;
}

export async function createResume(
  context: BrowserContext,
  user: SignedInUser,
  resume: { label: string; contentText: string; isDefault?: boolean },
): Promise<CreatedResume> {
  const response = await context.request.post(`${BASE_URL}/api/v1/resumes`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
    data: {
      label: resume.label,
      content_text: resume.contentText,
      is_default: resume.isDefault ?? true,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as CreatedResume;
}

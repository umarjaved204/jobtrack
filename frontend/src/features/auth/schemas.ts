import { z } from 'zod';

/*
 * Client-side rules mirror backend/app/schemas/auth.py + user.py, so most mistakes are
 * caught before a round trip. The server stays the authority: anything it still rejects
 * (e.g. an email that passes this check but not Pydantic's EmailStr) comes back as a 422
 * and is shown on the matching field.
 */

export const PASSWORD_MIN = 8; // NewPassword: min_length=8
export const PASSWORD_MAX = 128; // max_length=128 (guards against huge payloads)
export const FULL_NAME_MAX = 120; // FullName: 1..120 after strip

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .pipe(z.email('Enter a valid email address, like name@example.com'));

export const loginSchema = z.object({
  email,
  // Login only needs *a* password; length rules apply to new passwords.
  password: z
    .string()
    .min(1, 'Enter your password')
    .max(PASSWORD_MAX, `Passwords are at most ${PASSWORD_MAX} characters`),
});

export const registerSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .max(FULL_NAME_MAX, `Keep it under ${FULL_NAME_MAX} characters`),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

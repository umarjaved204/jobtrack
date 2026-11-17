import type { Theme } from '@/lib/theme';

/** `UserRead` (backend/app/schemas/user.py). */
export type User = {
  id: string;
  email: string;
  full_name: string;
  /** Same values as the backend `ThemePreference` StrEnum. */
  theme: Theme;
  /** Palette colour name, validated server-side against ^[a-z][a-z-]{0,19}$. */
  accent: string;
  created_at: string;
};

/** `AuthResponse`: body of POST /auth/register, /auth/login and /auth/refresh. */
export type AuthResponse = {
  access_token: string;
  token_type: 'bearer';
  /** Access-token lifetime in seconds, counted from when the response arrives. */
  expires_in: number;
  user: User;
};

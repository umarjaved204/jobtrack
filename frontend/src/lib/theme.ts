import { useSyncExternalStore } from 'react';

import { type AccentColor, accentColors, DEFAULT_ACCENT } from '@/lib/palette';

/**
 * Theme + accent state. The pre-paint script in index.html applies the stored values
 * before React loads; this module keeps them in sync afterwards. Keys and the accent
 * check must match that script. (Phase 5+ also syncs these with `users.theme/accent`.)
 */
export const THEME_STORAGE_KEY = 'jobtrack:theme';
export const ACCENT_STORAGE_KEY = 'jobtrack:accent';

export const themes = ['light', 'dark', 'system'] as const;
export type Theme = (typeof themes)[number];

type ThemeState = { theme: Theme; accent: AccentColor };

const isTheme = (v: unknown): v is Theme => themes.includes(v as Theme);
const isAccent = (v: unknown): v is AccentColor => accentColors.includes(v as AccentColor);

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (privacy mode)
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted, but the change still applies for this session.
  }
}

/**
 * Browser UI colour (the `theme-color` meta) per resolved theme: the `--paper` token of
 * each theme in tokens.css. The pre-paint script in index.html uses the same two values;
 * tests fail if any of the three drift apart.
 */
export const THEME_COLORS = { light: '#f3ede2', dark: '#12100e' } as const;

/** What each theme is called in the appearance menu and in Settings. */
export const THEME_NAMES: Record<Theme, string> = {
  light: 'Broadsheet',
  dark: 'Night edition',
  system: 'Match system',
};

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Whether `theme` renders dark right now (`system` follows the OS). */
export function resolvesToDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && darkQuery().matches);
}

function apply({ theme, accent }: ThemeState) {
  const root = document.documentElement;
  const dark = resolvesToDark(theme);
  root.classList.toggle('dark', dark);
  root.dataset['accent'] = accent;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

function readInitial(): ThemeState {
  const theme = readStorage(THEME_STORAGE_KEY);
  const accent = readStorage(ACCENT_STORAGE_KEY);
  return {
    theme: isTheme(theme) ? theme : 'system',
    accent: isAccent(accent) ? accent : DEFAULT_ACCENT,
  };
}

let state: ThemeState = readInitial();
const listeners = new Set<() => void>();

function setState(next: Partial<ThemeState>) {
  state = { ...state, ...next };
  apply(state);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // While on "system", follow OS changes live.
  const query = darkQuery();
  const onChange = () => {
    if (state.theme === 'system') setState({});
  };
  query.addEventListener('change', onChange);
  return () => {
    listeners.delete(listener);
    query.removeEventListener('change', onChange);
  };
}

export function setTheme(theme: Theme) {
  writeStorage(THEME_STORAGE_KEY, theme);
  setState({ theme });
}

export function setAccent(accent: AccentColor) {
  writeStorage(ACCENT_STORAGE_KEY, accent);
  setState({ accent });
}

/** Test helper: re-read storage and re-apply (module state otherwise persists across tests). */
export function resetThemeForTests() {
  state = readInitial();
  apply(state);
}

export function useTheme() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return { ...current, setTheme, setAccent };
}

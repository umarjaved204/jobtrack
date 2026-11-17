import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import indexHtml from '../../index.html?raw';
import tokensCss from '../styles/tokens.css?raw';
import {
  ACCENT_STORAGE_KEY,
  resetThemeForTests,
  resolvesToDark,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  useTheme,
} from './theme';

/** Fake `prefers-color-scheme` that tests can flip. */
function mockSystemDark(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query.includes('dark') ? matches : false;
        },
        media: query,
        addEventListener: (_: string, l: () => void) => listeners.add(l),
        removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      }) as unknown as MediaQueryList,
  );
  return (next: boolean) => {
    matches = next;
    listeners.forEach((l) => l());
  };
}

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.className = '';
  delete root.dataset['accent'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('theme', () => {
  it('defaults to system + vermilion', () => {
    resetThemeForTests();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.accent).toBe('vermilion');
    expect(root.dataset['accent']).toBe('vermilion');
  });

  it('applies and persists an explicit theme', () => {
    resetThemeForTests();
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('dark'));
    expect(root).toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => result.current.setTheme('light'));
    expect(root).not.toHaveClass('dark');
  });

  it('follows the OS live while on "system"', () => {
    const setSystemDark = mockSystemDark(false);
    resetThemeForTests();
    renderHook(() => useTheme());
    expect(root).not.toHaveClass('dark');

    act(() => setSystemDark(true));
    expect(root).toHaveClass('dark');
  });

  it('ignores the OS once a theme is chosen', () => {
    const setSystemDark = mockSystemDark(false);
    resetThemeForTests();
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('light'));
    act(() => setSystemDark(true));
    expect(root).not.toHaveClass('dark');
  });

  it('applies and persists the accent', () => {
    resetThemeForTests();
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setAccent('cobalt'));
    expect(root.dataset['accent']).toBe('cobalt');
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('cobalt');
  });

  it('falls back to defaults for unknown stored values', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    localStorage.setItem(ACCENT_STORAGE_KEY, 'oxblood'); // palette colour, but not an accent
    resetThemeForTests();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.accent).toBe('vermilion');
  });

  describe('browser theme-color', () => {
    const themeColor = () =>
      document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

    beforeEach(() => {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = THEME_COLORS.light;
      document.head.append(meta);
    });
    afterEach(() => {
      document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    });

    it('follows the theme chosen in the app, not the OS', () => {
      mockSystemDark(false);
      resetThemeForTests();
      const { result } = renderHook(() => useTheme());

      act(() => result.current.setTheme('dark'));
      expect(themeColor()).toBe(THEME_COLORS.dark);
      act(() => result.current.setTheme('light'));
      expect(themeColor()).toBe(THEME_COLORS.light);
    });

    it('follows the OS live while on "system"', () => {
      const setSystemDark = mockSystemDark(false);
      resetThemeForTests();
      renderHook(() => useTheme());
      expect(themeColor()).toBe(THEME_COLORS.light);

      act(() => setSystemDark(true));
      expect(themeColor()).toBe(THEME_COLORS.dark);
    });

    it('uses the --paper token of each theme, same values as the pre-paint script', () => {
      const paper = [...tokensCss.matchAll(/--paper:\s*(#[0-9a-f]{6});/gi)].map((m) => m[1]);
      expect(paper).toEqual([THEME_COLORS.light, THEME_COLORS.dark]); // :root, then .dark
      expect(indexHtml).toContain(`dark ? '${THEME_COLORS.dark}' : '${THEME_COLORS.light}'`);
    });
  });

  it('resolves system against the OS preference', () => {
    mockSystemDark(true);
    expect(resolvesToDark('system')).toBe(true);
    expect(resolvesToDark('light')).toBe(false);
    expect(resolvesToDark('dark')).toBe(true);
  });
});

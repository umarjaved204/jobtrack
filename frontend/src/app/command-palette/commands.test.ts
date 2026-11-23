import { describe, expect, it, vi } from 'vitest';

import { navItems } from '@/app/navigation';
import { addApplicationState } from '@/features/applications/add-application-state';

import {
  filterCommands,
  isApplePlatform,
  isPaletteShortcut,
  paletteCommands,
  shortcutHint,
} from './commands';

const labels = (query: string, theme: 'light' | 'dark' | 'system' = 'system') =>
  filterCommands(paletteCommands(theme), query).map((c) => c.label);

const key = (init: Partial<KeyboardEvent>) => ({
  key: 'k',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...init,
});

describe('paletteCommands', () => {
  it('lists the actions, then every section', () => {
    expect(labels('')).toEqual([
      'Add an application',
      'Run a match',
      'Switch to the light theme',
      'Switch to the dark theme',
      ...navItems.map((item) => item.label),
    ]);
  });

  it('leaves out the theme already in use', () => {
    expect(labels('theme', 'dark')).toEqual([
      'Switch to the light theme',
      'Match the system theme',
    ]);
  });

  it('runs each command through the context', () => {
    const context = { navigate: vi.fn(), setTheme: vi.fn() };
    const byId = (id: string) => paletteCommands('system').find((c) => c.id === id);

    byId('add-application')?.run(context);
    expect(context.navigate).toHaveBeenLastCalledWith('/applications', {
      state: addApplicationState,
    });
    byId('run-match')?.run(context);
    expect(context.navigate).toHaveBeenLastCalledWith('/match');
    byId('go-calendar')?.run(context);
    expect(context.navigate).toHaveBeenLastCalledWith('/calendar');
    byId('theme-dark')?.run(context);
    expect(context.setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('filterCommands', () => {
  it('needs every word, in any order and case, from the label, keywords or group', () => {
    expect(labels('DARK')).toEqual(['Switch to the dark theme']);
    expect(labels('theme dark')).toEqual(['Switch to the dark theme']);
    expect(labels('night mode')).toEqual(['Switch to the light theme', 'Switch to the dark theme']);
    expect(labels('new job')).toEqual(['Add an application']);
    expect(labels('go cal')).toEqual(['Calendar']);
    expect(labels('  ')).toHaveLength(paletteCommands('system').length);
  });

  it('returns nothing when a word matches no command', () => {
    expect(labels('calendar zebra')).toEqual([]);
  });
});

describe('the shortcut', () => {
  it('is ⌘K on Apple platforms and Ctrl+K elsewhere', () => {
    expect(isPaletteShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isPaletteShortcut(key({ ctrlKey: true }), true)).toBe(false); // kill-line on a Mac
    expect(isPaletteShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isPaletteShortcut(key({ metaKey: true }), false)).toBe(false);
  });

  it('ignores other keys and extra modifiers; caps lock is fine', () => {
    expect(isPaletteShortcut(key({ key: 'K', ctrlKey: true }), false)).toBe(true);
    expect(isPaletteShortcut(key({ key: 'j', ctrlKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key({ ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key({ ctrlKey: true, metaKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key({}), false)).toBe(false);
  });

  it('is labelled for the platform', () => {
    expect(shortcutHint(true)).toEqual({ keys: ['⌘', 'K'], aria: 'Meta+K' });
    expect(shortcutHint(false)).toEqual({ keys: ['Ctrl', 'K'], aria: 'Control+K' });
  });

  it('detects Apple platforms from the platform, or the user agent when it is empty', () => {
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isApplePlatform({ platform: 'iPad', userAgent: '' })).toBe(true);
    expect(isApplePlatform({ platform: 'Win32', userAgent: 'Macintosh' })).toBe(false);
    expect(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPhone; CPU…)' })).toBe(true);
    expect(isApplePlatform({ platform: 'Linux x86_64', userAgent: '' })).toBe(false);
  });
});

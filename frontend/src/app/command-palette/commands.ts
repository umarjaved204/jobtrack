import { type LucideIcon, Monitor, Moon, Plus, Sparkles, Sun } from 'lucide-react';

import { navItems } from '@/app/navigation';
import { addApplicationState } from '@/features/applications/add-application-state';
import type { Theme } from '@/lib/theme';

/*
 * The ⌘K palette's fixed commands, its filter and its shortcut, kept free of React so they
 * can be tested on their own. Applications are searched on the server instead (the same
 * `?q=` as the table), so they aren't in this list.
 */

export type CommandContext = {
  navigate: (to: string, options?: { state?: unknown }) => void;
  setTheme: (theme: Theme) => void;
};

export type CommandGroupId = 'actions' | 'navigation';

export type PaletteCommand = {
  id: string;
  group: CommandGroupId;
  label: string;
  /** Other words people might type for it (lower case). */
  keywords: string[];
  icon: LucideIcon;
  run: (context: CommandContext) => void;
};

export const groupHeadings: Record<CommandGroupId, string> = {
  actions: 'Actions',
  navigation: 'Go to',
};

const themeCommands: Record<Theme, { label: string; icon: LucideIcon }> = {
  light: { label: 'Switch to the light theme', icon: Sun },
  dark: { label: 'Switch to the dark theme', icon: Moon },
  system: { label: 'Match the system theme', icon: Monitor },
};

/** Every fixed command, actions first. The current theme isn't offered (it would do nothing). */
export function paletteCommands(currentTheme: Theme): PaletteCommand[] {
  const actions: PaletteCommand[] = [
    {
      id: 'add-application',
      group: 'actions',
      label: 'Add an application',
      keywords: ['new', 'create', 'job', 'role', 'wishlist'],
      icon: Plus,
      run: ({ navigate }) => navigate('/applications', { state: addApplicationState }),
    },
    {
      id: 'run-match',
      group: 'actions',
      label: 'Run a match',
      keywords: ['ai', 'resume', 'job description', 'jd', 'score', 'compare', 'skills'],
      icon: Sparkles,
      run: ({ navigate }) => navigate('/match'),
    },
    ...(Object.keys(themeCommands) as Theme[])
      .filter((theme) => theme !== currentTheme)
      .map((theme): PaletteCommand => ({
        id: `theme-${theme}`,
        group: 'actions',
        ...themeCommands[theme],
        keywords: ['theme', 'appearance', 'mode', 'colour', 'color', 'night', 'broadsheet'],
        run: ({ setTheme }) => setTheme(theme),
      })),
  ];
  const navigation = navItems.map(({ to, label, icon }): PaletteCommand => ({
    id: `go-${to.slice(1)}`,
    group: 'navigation',
    label,
    keywords: ['go', 'open', 'page'],
    icon,
    run: ({ navigate }) => navigate(to),
  }));
  return [...actions, ...navigation];
}

/** Commands whose label, keywords or group contain every typed word (any order, any case). */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return commands.filter((command) => {
    const text = [command.label, groupHeadings[command.group], ...command.keywords]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Macs and iPads use ⌘; everything else uses Ctrl. */
export function isApplePlatform(nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator) {
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform || nav.userAgent);
}

/**
 * ⌘K on Apple platforms, Ctrl+K elsewhere. Not Ctrl+K on a Mac: in text fields that's
 * "delete to the end of the line".
 */
export function isPaletteShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  apple: boolean,
): boolean {
  if (event.key.toLowerCase() !== 'k' || event.altKey || event.shiftKey) return false;
  return apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** What the shortcut looks like on the key caps, and for `aria-keyshortcuts`. */
export function shortcutHint(apple: boolean): { keys: string[]; aria: string } {
  return apple ? { keys: ['⌘', 'K'], aria: 'Meta+K' } : { keys: ['Ctrl', 'K'], aria: 'Control+K' };
}

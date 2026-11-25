import type { ReactNode } from 'react';

import { useThemePreference } from '@/features/auth/hooks';
import { type AccentColor, accentColors } from '@/lib/palette';
import { THEME_COLORS, THEME_NAMES, type Theme, themes } from '@/lib/theme';
import { cn } from '@/lib/utils';

const THEME_NOTES: Record<Theme, string> = {
  light: 'Ink on paper, the default.',
  dark: 'Cream on night paper, for the evening.',
  system: 'Switches with your device’s setting.',
};

/*
 * The previews show each theme whatever the page is in now, so they can't use the theme
 * tokens (they flip with the page). Paper is THEME_COLORS; ink mirrors tokens.css.
 */
const PREVIEW_INK = { light: '#16130f', dark: '#ede5d6' } as const;
const PREVIEW_PAPER: Record<Theme, string> = {
  light: THEME_COLORS.light,
  dark: THEME_COLORS.dark,
  system: `linear-gradient(90deg, ${THEME_COLORS.light} 50%, ${THEME_COLORS.dark} 50%)`,
};

const ACCENT_NAMES: Record<AccentColor, string> = {
  vermilion: 'Vermilion',
  cobalt: 'Cobalt',
  teal: 'Teal',
  forest: 'Forest',
  ochre: 'Ochre',
  plum: 'Plum',
  ink: 'Ink',
};

/**
 * Theme and accent, as radio groups: the same preference as the Appearance menu in the
 * masthead (applied at once, saved to the profile, restored if the save fails).
 */
function AppearanceSection() {
  const { theme, accent, setTheme, setAccent } = useThemePreference();

  return (
    <section aria-labelledby="appearance-heading" className="grid gap-5 border-t border-rule pt-6">
      <h2 id="appearance-heading" className="font-display text-xl font-semibold">
        Appearance
      </h2>
      <fieldset className="grid gap-2.5">
        <legend className="pb-2.5 text-sm font-semibold">Edition</legend>
        <div className="grid gap-3.5 sm:grid-cols-3">
          {themes.map((t) => (
            <Choice
              key={t}
              name="theme"
              checked={theme === t}
              onSelect={() => setTheme(t)}
              className="flex-col items-stretch gap-2.5 p-3"
            >
              <ThemePreview theme={t} />
              <span className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                <RadioMark checked={theme === t} />
                {THEME_NAMES[t]}
              </span>
              <span className="text-[0.8125rem] text-muted-foreground">{THEME_NOTES[t]}</span>
            </Choice>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2.5">
        <legend className="pb-2.5 text-sm font-semibold">Accent</legend>
        <div className="flex flex-wrap gap-3">
          {accentColors.map((name) => (
            <Choice
              key={name}
              name="accent"
              checked={accent === name}
              onSelect={() => setAccent(name)}
              className="min-h-11 gap-2.5 py-1 pr-3.5 pl-2 text-[0.9375rem] font-medium"
            >
              <span
                aria-hidden="true"
                className="size-6.5 shrink-0"
                style={{ background: `var(--palette-${name})` }}
              />
              {ACCENT_NAMES[name]}
            </Choice>
          ))}
        </div>
        <p className="text-[0.8125rem] text-muted-foreground">
          Saved to your account, so every device you sign in on opens the same way.
        </p>
      </fieldset>
    </section>
  );
}

/** A native radio wrapped in its label: the whole card is the target, arrows move along. */
function Choice({
  name,
  checked,
  onSelect,
  className,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer items-center bg-card transition-colors duration-(--duration-fast) hover:bg-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
        checked ? 'outline-2 -outline-offset-2 outline-foreground' : 'border border-input',
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      {children}
    </label>
  );
}

/** The visible radio circle; the real input is visually hidden inside the label. */
function RadioMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-4.5 shrink-0 place-items-center rounded-full border-2 border-foreground"
    >
      {checked && <span className="size-2 rounded-full bg-foreground" />}
    </span>
  );
}

function ThemePreview({ theme }: { theme: Theme }) {
  const ink = theme === 'dark' ? PREVIEW_INK.dark : PREVIEW_INK.light;
  const line = theme === 'system' ? '#8a8073' : ink;
  return (
    <span
      aria-hidden="true"
      className="grid h-23 content-start gap-1.5 border border-input p-2.5"
      style={{ background: PREVIEW_PAPER[theme] }}
    >
      <span
        className="font-display text-lg leading-none font-semibold"
        style={{ color: theme === 'system' ? line : ink }}
      >
        Job<span className="text-primary">Track</span>
      </span>
      <span className="h-0.5" style={{ background: line }} />
      <span className="h-1.5 w-[70%] opacity-40" style={{ background: line }} />
      <span className="h-1.5 w-1/2 opacity-40" style={{ background: line }} />
    </span>
  );
}

export { AppearanceSection };

import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type AccentColor, accentColors } from '@/lib/palette';
import { useThemePreference } from '@/features/auth/hooks';
import { type Theme, themes } from '@/lib/theme';

const themeMeta: Record<Theme, { label: string; icon: typeof Sun }> = {
  light: { label: 'Broadsheet (light)', icon: Sun },
  dark: { label: 'Night edition (dark)', icon: Moon },
  system: { label: 'Match system', icon: Monitor },
};

/** Appearance menu: light / dark / system plus the accent colour (saved to the profile). */
function ThemeMenu() {
  const { theme, accent, setTheme, setAccent } = useThemePreference();
  const TriggerIcon = themeMeta[theme].icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Appearance">
          <TriggerIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {themes.map((t) => {
            const { label, icon: Icon } = themeMeta[t];
            return (
              <DropdownMenuRadioItem key={t} value={t}>
                <Icon /> {label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Accent</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={accent} onValueChange={(v) => setAccent(v as AccentColor)}>
          {accentColors.map((name) => (
            <DropdownMenuRadioItem key={name} value={name} className="capitalize">
              <span
                aria-hidden="true"
                className="size-3.5 rounded-full border border-rule/20"
                style={{ background: `var(--palette-${name})` }}
              />
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ThemeMenu };

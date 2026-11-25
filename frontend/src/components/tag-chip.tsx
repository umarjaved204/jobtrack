import { XIcon } from 'lucide-react';
import type * as React from 'react';

import { type PaletteColor, paletteColors } from '@/lib/palette';
import { cn } from '@/lib/utils';

/** A stored tag colour → a palette name we have tokens for (unknown names fall back to ink). */
function tagColor(color: string): PaletteColor {
  return paletteColors.includes(color as PaletteColor) ? (color as PaletteColor) : 'ink';
}

type TagChipProps = React.ComponentProps<'span'> & {
  name: string;
  color: string;
  /** Shows a remove button labelled "Remove <name>". */
  onRemove?: () => void;
};

/**
 * An outlined tag: quiet decorative outline, secondary text, and a small square in the
 * tag's palette colour (the name is the label; the colour only helps scanning).
 * Colours come from CSS variables, so any palette name works without new classes.
 */
function TagChip({ name, color, onRemove, className, style, ...props }: TagChipProps) {
  const palette = tagColor(color);
  return (
    <span
      data-slot="tag-chip"
      data-color={palette}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 border border-border-quiet px-[7px] py-0.5 text-xs leading-4 font-medium text-muted-foreground',
        className,
      )}
      style={style}
      {...props}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0"
        style={{ background: `var(--palette-${palette})` }}
      />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="-my-1 -mr-1.5 grid size-6 cursor-pointer place-items-center hover:bg-accent hover:text-foreground"
        >
          <XIcon aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  );
}

export { TagChip };

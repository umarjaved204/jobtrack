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
 * A tag in its palette colour: tint background + text-safe ink (AA-tested pair).
 * Colours come from CSS variables, so any palette name works without new classes.
 */
function TagChip({ name, color, onRemove, className, style, ...props }: TagChipProps) {
  const palette = tagColor(color);
  return (
    <span
      data-slot="tag-chip"
      data-color={palette}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs leading-4 font-semibold',
        className,
      )}
      style={{
        background: `var(--palette-${palette}-tint)`,
        color: `var(--palette-${palette})`,
        ...style,
      }}
      {...props}
    >
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="-mr-0.5 grid size-4 cursor-pointer place-items-center rounded-xs hover:fill-hover"
        >
          <XIcon aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  );
}

export { TagChip };

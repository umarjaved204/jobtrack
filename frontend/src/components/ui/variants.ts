import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * Class recipes shared by the UI components. Kept out of the component files so those
 * export only components (required for React Fast Refresh).
 */

/*
 * Broadsheet buttons: square corners, semibold type, a 1px "press" on click. The default
 * size is 44px (WCAG 2.5.5 target size); `sm` and `xs` are for dense rows only.
 * Hover on solid fills uses `fill-hover` (an overlay that raises contrast) instead of
 * fading the fill, which would push vermilion below AA. `ink` is the secondary solid
 * (selected segments, "Run" actions): no overlay reads on near-black or cream, so it
 * underlines on hover instead.
 * Focus uses the global :focus-visible outline (cobalt ring) from index.css.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 font-semibold whitespace-nowrap select-none',
    'transition-[background-color,background-image,color,box-shadow,translate] duration-(--duration-fast) ease-out-quint',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:fill-hover',
        ink: 'bg-foreground text-background underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground hover:fill-hover',
        outline: 'border border-rule bg-transparent text-foreground hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:fill-hover',
        ghost: 'text-foreground hover:bg-accent',
        link: 'text-primary-text underline decoration-1 underline-offset-4 hover:decoration-2',
      },
      size: {
        default: 'h-11 px-4 text-[0.9375rem] has-[>svg]:px-3.5',
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: 'h-9 gap-1.5 px-3 text-sm has-[>svg]:px-2.5',
        lg: 'h-12 px-6 text-base has-[>svg]:px-5',
        icon: 'size-11',
        'icon-sm': 'size-9',
        'icon-lg': 'size-12',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 has-[>svg]:px-0' }],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/*
 * Small labels set like newspaper section tags: square corners, semibold, tight.
 * Tinted variants pair `<colour>-tint` backgrounds with text-safe `<colour>` text (AA-tested).
 */
export const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center gap-1.5 overflow-hidden border border-transparent px-2 py-0.5',
    'text-xs leading-4 font-semibold whitespace-nowrap',
    '[&>svg]:pointer-events-none [&>svg]:size-3',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary-tint text-primary-text',
        solid: 'bg-primary text-primary-foreground',
        secondary: 'bg-muted text-foreground',
        outline: 'border-rule text-foreground',
        destructive: 'bg-oxblood-tint text-oxblood',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/**
 * Shared field styling (Input, Textarea; the Select trigger matches it). Flat card-coloured
 * fields with an `--input` edge, which is ≥ 3:1 against every surface (WCAG 1.4.11; the
 * mockups' paler edge isn't). Text is 16px at every width, so iOS doesn't zoom into a
 * focused field. Invalid state comes from `aria-invalid`, which form libraries set.
 */
export const fieldClasses = cn(
  'w-full min-w-0 border border-input bg-card text-base text-foreground',
  'transition-[border-color,box-shadow] duration-(--duration-fast) ease-out-quint',
  'placeholder:text-muted-foreground hover:border-foreground focus-visible:border-ring',
  'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
);

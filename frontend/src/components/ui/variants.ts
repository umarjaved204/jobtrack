import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * Class recipes shared by the UI components. Kept out of the component files so those
 * export only components (required for React Fast Refresh).
 */

/*
 * Broadsheet buttons: crisp 4px corners, semibold type, a 1px "press" on click.
 * Hover on solid fills uses `fill-hover` (an overlay that raises contrast) instead of
 * fading the fill, which would push vermilion below AA.
 * Focus uses the global :focus-visible outline (cobalt ring) from index.css.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none',
    'transition-[background-color,background-image,color,box-shadow,translate] duration-(--duration-fast) ease-out-quint',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:fill-hover',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:fill-hover',
        outline: 'border border-rule bg-transparent text-foreground hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:fill-hover',
        ghost: 'text-foreground hover:bg-accent',
        link: 'text-primary-text underline decoration-1 underline-offset-4 hover:decoration-2',
      },
      size: {
        default: 'h-10 px-4 text-sm has-[>svg]:px-3',
        xs: "h-7 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: 'h-8 gap-1.5 px-3 text-sm has-[>svg]:px-2.5',
        lg: 'h-12 px-6 text-base has-[>svg]:px-5',
        icon: 'size-10',
        'icon-sm': 'size-8',
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
 * Small labels set like newspaper section tags: square-ish corners, semibold, tight.
 * Tinted variants pair `<colour>-tint` backgrounds with text-safe `<colour>` text (AA-tested).
 */
export const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center gap-1 overflow-hidden rounded-sm border border-transparent px-1.5 py-0.5',
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
 * Shared field styling (Input, Textarea). `--input` is ≥ 3:1 against every surface
 * (WCAG 1.4.11); invalid state comes from `aria-invalid`, which form libraries set.
 */
export const fieldClasses = cn(
  'w-full min-w-0 rounded-md border border-input bg-card text-base text-foreground shadow-xs md:text-sm',
  'transition-[border-color,box-shadow] duration-(--duration-fast) ease-out-quint',
  'placeholder:text-muted-foreground hover:border-foreground focus-visible:border-ring',
  'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
);

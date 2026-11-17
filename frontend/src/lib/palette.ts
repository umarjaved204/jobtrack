/**
 * Named palette colours. The API stores these names (users.accent, tags.color),
 * and each one has `--palette-<name>` + `--palette-<name>-tint` in src/styles/tokens.css.
 */
export const paletteColors = [
  'vermilion',
  'cobalt',
  'teal',
  'ochre',
  'forest',
  'plum',
  'oxblood',
  'stone',
  'ink',
] as const;

export type PaletteColor = (typeof paletteColors)[number];

/**
 * Colours offered as the UI accent. Oxblood (reads as "error") and stone (reads as
 * "disabled") are tag-only. Each accent has a `[data-accent]` block in tokens.css.
 */
export const accentColors = [
  'vermilion',
  'cobalt',
  'teal',
  'forest',
  'ochre',
  'plum',
  'ink',
] as const satisfies readonly PaletteColor[];

export type AccentColor = (typeof accentColors)[number];

export const DEFAULT_ACCENT: AccentColor = 'vermilion';
export const DEFAULT_TAG_COLOR: PaletteColor = 'ink';

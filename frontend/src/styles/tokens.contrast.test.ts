/**
 * Guards the design tokens:
 * - every text/background pairing the UI relies on meets WCAG 2.2 AA, in light and
 *   dark, for every accent colour;
 * - every palette/accent name used by the app has its CSS variables;
 * - motion tokens in CSS and TS agree.
 */
import { describe, expect, it } from 'vitest';

import { duration, ease } from '../lib/motion';
import { accentColors, paletteColors } from '../lib/palette';
import indexCss from './index.css?raw';
import tokensCss from './tokens.css?raw';

type Vars = Record<string, string>;
type Rule = { selectors: string[]; vars: Vars };

/** Top-level rules only (skips @media etc.), with their custom-property declarations. */
function parseRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let depth = 0;
  let start = 0;
  let selector = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) {
        selector = src.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (!selector.startsWith('@')) {
          const vars: Vars = {};
          for (const [, key, value] of src.slice(start, i).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
            if (key && value) vars[key] = value.trim();
          }
          rules.push({ selectors: selector.split(',').map((s) => s.trim()), vars });
        }
        start = i + 1;
      }
    }
  }
  return rules;
}

const rules = parseRules(tokensCss);
const varsFor = (selector: string): Vars =>
  Object.assign({}, ...rules.filter((r) => r.selectors.includes(selector)).map((r) => r.vars));

const light = varsFor(':root');
const themes: Record<string, Vars> = { light, dark: { ...light, ...varsFor('.dark') } };

function resolve(vars: Vars, name: string, seen = new Set<string>()): string {
  const raw = vars[name];
  if (raw === undefined) throw new Error(`--${name} is not defined`);
  const target = /^var\(--([\w-]+)\)$/.exec(raw)?.[1];
  if (!target) return raw;
  if (seen.has(name)) throw new Error(`circular reference at --${name}`);
  seen.add(name);
  return resolve(vars, target, seen);
}

function luminance(hex: string): number {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!digits) throw new Error(`expected a 6-digit hex colour, got "${hex}"`);
  const n = parseInt(digits, 16);
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(n >> 16) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TEXT = 4.5; // WCAG 1.4.3, normal text
const NON_TEXT = 3; // WCAG 1.4.11 (UI boundaries, focus) and 1.4.3 large text

type Pair = [fg: string, bg: string, min: number];

const SURFACES = ['background', 'card', 'popover'];

/** Pairs that don't depend on the accent. */
const themePairs: Pair[] = [
  ...['background', 'card', 'popover', 'muted', 'secondary', 'accent'].map((bg): Pair => [
    'foreground',
    bg,
    TEXT,
  ]),
  ...['background', 'card', 'muted', 'accent'].map((bg): Pair => ['muted-foreground', bg, TEXT]),
  ['destructive-foreground', 'destructive', TEXT],
  ...SURFACES.map((bg): Pair => ['input', bg, NON_TEXT]),
  ...SURFACES.map((bg): Pair => ['ring', bg, NON_TEXT]),
  ...paletteColors.flatMap((name): Pair[] => {
    const c = `palette-${name}`;
    return [
      ...SURFACES.map((bg): Pair => [c, bg, TEXT]),
      [c, `${c}-tint`, TEXT],
      ['palette-on', c, TEXT],
    ];
  }),
  ...['wishlist', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'].map(
    (s): Pair => [`status-${s}`, `status-${s}-tint`, TEXT],
  ),
];

/** Pairs re-pointed by `data-accent`. */
const accentPairs: Pair[] = [
  ['primary-foreground', 'primary', TEXT],
  ...SURFACES.map((bg): Pair => ['primary-text', bg, TEXT]),
  ['primary-text', 'primary-tint', TEXT],
  ...SURFACES.map((bg): Pair => ['brand', bg, NON_TEXT]),
];

function expectContrast(vars: Vars, fg: string, bg: string, min: number) {
  const [a, b] = [resolve(vars, fg), resolve(vars, bg)];
  expect(contrast(a, b), `${a} on ${b}`).toBeGreaterThanOrEqual(min);
}

/** A fill with the `--fill-hover` overlay (rgb(r g b / a)) alpha-composited on top. */
function hovered(vars: Vars, fill: string): string {
  const overlay = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(resolve(vars, 'fill-hover'));
  if (!overlay) throw new Error('--fill-hover must be rgb(r g b / a)');
  const [, r, g, b, alpha] = overlay.map(Number) as [number, number, number, number, number];
  const base = parseInt(resolve(vars, fill).slice(1), 16);
  const mix = (top: number, bottom: number) => Math.round(top * alpha + bottom * (1 - alpha));
  const out = [mix(r, base >> 16), mix(g, (base >> 8) & 255), mix(b, base & 255)];
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function expectHoverContrast(vars: Vars, fg: string, fill: string) {
  const [a, b] = [resolve(vars, fg), hovered(vars, fill)];
  expect(contrast(a, b), `${a} on hovered ${b}`).toBeGreaterThanOrEqual(TEXT);
}

describe.each(Object.entries(themes))('%s theme', (_theme, themeVars) => {
  it.each(themePairs)('--%s on --%s ≥ %s:1', (fg, bg, min) => {
    expectContrast(themeVars, fg, bg, min);
  });

  it.each([
    ['destructive-foreground', 'destructive'],
    ['secondary-foreground', 'secondary'],
  ])('--%s on hovered --%s stays AA', (fg, fill) => {
    expectHoverContrast(themeVars, fg, fill);
  });

  describe.each(accentColors)('accent %s', (accent) => {
    const vars = { ...themeVars, ...varsFor(`[data-accent='${accent}']`) };
    it.each(accentPairs)('--%s on --%s ≥ %s:1', (fg, bg, min) => {
      expectContrast(vars, fg, bg, min);
    });
    it('--primary-foreground on hovered --primary stays AA', () => {
      expectHoverContrast(vars, 'primary-foreground', 'primary');
    });
  });
});

describe('palette completeness', () => {
  it.each(paletteColors)('%s has a colour and tint in both themes', (name) => {
    for (const vars of Object.values(themes)) {
      expect(resolve(vars, `palette-${name}`)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(resolve(vars, `palette-${name}-tint`)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(accentColors)('accent %s has a [data-accent] block', (name) => {
    const block = varsFor(`[data-accent='${name}']`);
    expect(Object.keys(block)).toEqual(
      expect.arrayContaining(['primary', 'primary-text', 'primary-tint', 'brand']),
    );
  });

  it('only defines accent blocks for known accents', () => {
    const declared = rules
      .flatMap((r) => r.selectors)
      .map((s) => /^\[data-accent='([a-z-]+)'\]$/.exec(s)?.[1])
      .filter(Boolean);
    expect(new Set(declared)).toEqual(new Set(accentColors));
  });
});

describe('motion tokens', () => {
  it.each(Object.entries(duration))('--duration-%s matches motion.ts', (name, seconds) => {
    expect(light[`duration-${name}`]).toBe(`${Math.round(seconds * 1000)}ms`);
  });

  const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  it.each(Object.entries(ease))('--ease-%s matches motion.ts', (name, curve) => {
    const m = new RegExp(`--ease-${kebab(name)}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(indexCss);
    expect(m?.[1]?.split(',').map(Number), `--ease-${kebab(name)} in index.css`).toEqual([
      ...curve,
    ]);
  });
});

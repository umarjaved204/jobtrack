import { describe, expect, it } from 'vitest';

/*
 * All-caps text comes only from the `kicker` utilities in index.css (CLAUDE.md "All-caps"):
 * one place sets the size, weight and letter-spacing that make capitals readable. This
 * fails on an ad-hoc `uppercase` class or `text-transform: uppercase` anywhere else.
 */
const THIS_FILE = '/src/styles/uppercase.test.ts';
const UTILITIES = '/src/styles/index.css';

const sources = import.meta.glob<string>('/src/**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('all-caps text', () => {
  it('scans the source tree', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(sources[UTILITIES]).toBeDefined();
  });

  it('never uses `uppercase` outside the kicker utilities', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => path !== THIS_FILE && path !== UTILITIES)
      .flatMap(([path, code]) =>
        code
          .split('\n')
          .map((line, i) => ({ line, at: `${path}:${i + 1}` }))
          .filter(({ line }) => /\buppercase\b/.test(line))
          .map(({ at }) => at),
      );
    expect(offenders).toEqual([]);
  });

  it('sets text-transform in index.css only inside kicker utilities', () => {
    const css = sources[UTILITIES] ?? '';
    const blocks = [...css.matchAll(/@utility\s+([\w-]+)\s*\{([^}]*)\}/g)];
    const transforming = blocks
      .filter(([, , body]) => /text-transform:\s*uppercase/.test(body ?? ''))
      .map(([, name]) => name);

    expect(transforming).toContain('kicker');
    expect(transforming.filter((name) => !/^kicker(-|$)/.test(name ?? ''))).toEqual([]);
    // Every uppercase declaration in the file sits in one of those blocks.
    const all = css.match(/text-transform:\s*uppercase/g) ?? [];
    expect(all).toHaveLength(transforming.length);
  });
});

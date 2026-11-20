import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * CVE-2024-4367 ran attacker script through pdf.js compiling font glyphs with `eval`.
 * pdf.js v6 has no dynamic code at all (and no `isEvalSupported` switch left to turn
 * off), so this keeps it that way: an upgrade that brings `eval` or `new Function` back
 * into the files the app ships fails here, and needs a fresh look before it lands.
 */
const build = join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist')), '.');
const SHIPPED = ['pdf.mjs', 'pdf.worker.min.mjs'];

describe('pdf.js build', () => {
  it.each(SHIPPED)('%s runs no dynamically compiled code', (file) => {
    const code = readFileSync(join(build, file), 'utf8');
    expect(code).not.toMatch(/(^|[^.\w$])eval\s*\(/);
    expect(code).not.toMatch(/new\s+Function\s*\(/);
  });
});

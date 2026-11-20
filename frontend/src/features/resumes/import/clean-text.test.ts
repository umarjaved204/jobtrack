import { describe, expect, it } from 'vitest';

import { normaliseResumeText } from '../resume-schema';
import { cleanExtractedText } from './clean-text';

// Invisible characters, spelled out: a literal one can't be seen in review.
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

describe('cleanExtractedText', () => {
  it('turns bullet glyphs at the start of a line into "- "', () => {
    // U+F0B7: the private-use bullet that Word's Symbol font exports into PDFs.
    const symbolBullet = String.fromCodePoint(0xf0b7);
    const raw = [
      '• React',
      '▪ TypeScript',
      '  ◦ Vitest',
      `${symbolBullet} Playwright`,
      '●Storybook',
    ].join('\n');
    expect(cleanExtractedText(raw)).toBe(
      '- React\n- TypeScript\n- Vitest\n- Playwright\n- Storybook',
    );
  });

  it('leaves bullets in the middle of a line and plain list markers alone', () => {
    expect(cleanExtractedText('Python • SQL • Power BI\n- dashboards\n* reports')).toBe(
      'Python • SQL • Power BI\n- dashboards\n* reports',
    );
  });

  it('rejoins words hyphenated at a line end', () => {
    expect(cleanExtractedText('cut prepar-\nation time\nreduced manag-\nement overhead')).toBe(
      'cut preparation time\nreduced management overhead',
    );
  });

  it('keeps a hyphen before a capital or a number on the next line', () => {
    expect(cleanExtractedText('Front-\nEnd guild\nQ3-\n2026 roadmap')).toBe(
      'Front-\nEnd guild\nQ3-\n2026 roadmap',
    );
  });

  it('collapses runs of spaces from column layouts', () => {
    expect(cleanExtractedText('Python      SQL\t\tExcel   \n   Leeds')).toBe(
      'Python SQL Excel\nLeeds',
    );
  });

  it('drops invisible characters and keeps at most one blank line', () => {
    expect(
      cleanExtractedText(
        [
          'Data',
          SOFT_HYPHEN,
          'base',
          ZERO_WIDTH_SPACE,
          ' design',
          NO_BREAK_SPACE,
          'work',
          '\n\n\n\nEducation',
        ].join(''),
      ),
    ).toBe('Database design work\n\nEducation');
  });

  it('ends normalised exactly like pasted text', () => {
    const raw = '\r\n  Priya Raman\r\nAnalyst\0\r\n\r\n';
    const cleaned = cleanExtractedText(raw);
    expect(cleaned).toBe('Priya Raman\nAnalyst');
    expect(normaliseResumeText(cleaned)).toBe(cleaned);
  });
});

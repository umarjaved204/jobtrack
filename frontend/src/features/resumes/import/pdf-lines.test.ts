import { describe, expect, it } from 'vitest';

import { documentText, pageLines, type TextRun } from './pdf-lines';

/** A run as pdf.js reports it; width is roughly 5.5 pt per character at 11 pt. */
const run = (str: string, x: number, y: number, extra: Partial<TextRun> = {}): TextRun => ({
  str,
  x,
  y,
  width: str.length * 5.5,
  height: 11,
  hasEOL: false,
  ...extra,
});

describe('pageLines', () => {
  it('starts a new line for each baseline, not one line per page', () => {
    const lines = pageLines([
      run('Priya Raman', 56, 780),
      run('Data analyst, Manchester', 56, 766),
      run('Experience', 56, 752),
    ]);
    expect(lines).toEqual(['Priya Raman', 'Data analyst, Manchester', 'Experience']);
  });

  it('ends a line where pdf.js says it ends, even on the same baseline', () => {
    const lines = pageLines([
      run('Skills', 56, 780, { hasEOL: true }),
      run('Python, SQL', 56, 780),
    ]);
    expect(lines).toEqual(['Skills', 'Python, SQL']);
  });

  it('treats empty end-of-line runs as line ends', () => {
    const lines = pageLines([
      run('Leeds', 56, 780),
      run('', 0, 0, { hasEOL: true, height: 0, width: 0 }),
      run('2018 to 2021', 56, 780),
    ]);
    expect(lines).toEqual(['Leeds', '2018 to 2021']);
  });

  it('joins runs on one baseline, with a space only where there is a gap', () => {
    const lines = pageLines([
      run('Power', 56, 780),
      run('BI', 56 + 5 * 5.5 + 3, 780), // a word gap
      run('dash', 100, 766),
      run('boards', 100 + 4 * 5.5, 766), // kerned apart, no gap
      run('reports ', 56, 752),
      run('weekly', 56 + 8 * 5.5 + 3, 752), // the run already ends with a space
    ]);
    expect(lines).toEqual(['Power BI', 'dashboards', 'reports weekly']);
  });

  it('keeps a superscript on its line', () => {
    expect(pageLines([run('1', 56, 780), run('st', 61.5, 784, { height: 7 })])).toEqual(['1st']);
  });

  it('marks a large vertical gap as a blank line', () => {
    const lines = pageLines([
      run('Summary', 56, 780),
      run('Analyst with five years’ experience.', 56, 766),
      run('Experience', 56, 720),
    ]);
    expect(lines).toEqual(['Summary', 'Analyst with five years’ experience.', '', 'Experience']);
  });

  it('is empty for a page without text', () => {
    expect(pageLines([])).toEqual([]);
    expect(pageLines([run('', 0, 0, { hasEOL: true })])).toEqual([]);
    expect(pageLines([run('   ', 56, 780)])).toEqual([]);
  });
});

describe('documentText', () => {
  it('separates pages with a blank line and skips empty ones', () => {
    expect(documentText([['Page one'], [], ['Page two', 'more']])).toBe(
      'Page one\n\nPage two\nmore',
    );
  });
});

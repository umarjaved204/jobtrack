/*
 * pdf.js gives a page's text as positioned runs, not lines. Joining them all would make a
 * resume one long line, which the chunker and the match's evidence pairs can't use. Lines
 * are rebuilt from the runs: a run that ends a line (`hasEOL`), or a run on another
 * baseline, starts a new line; a horizontal gap between runs on one line becomes a space;
 * a large vertical gap becomes a blank line (headings and sections stay apart).
 */

export type TextRun = {
  str: string;
  /** Baseline origin in PDF units (pdf.js `transform[4]`, `transform[5]`). y grows upwards. */
  x: number;
  y: number;
  width: number;
  /** Font size, roughly; 0 for some empty runs. */
  height: number;
  hasEOL: boolean;
};

/** A baseline change larger than this share of the line's height starts a new line. */
const NEW_LINE_RATIO = 0.5;
/** A gap wider than this share of the height between runs on one line is a space. */
const SPACE_RATIO = 0.15;
/** A drop larger than this many line heights is a paragraph break (a blank line). */
const PARAGRAPH_RATIO = 1.8;

export function pageLines(runs: readonly TextRun[]): string[] {
  const lines: string[] = [];
  let line = '';
  let lineY: number | null = null;
  /** The tallest run on the current line. */
  let lineHeight = 0;
  let previous: TextRun | null = null;
  let endedLine = false;

  for (const run of runs) {
    if (run.str) {
      const height = run.height || lineHeight;
      if (lineY === null) {
        lineHeight = height;
      } else if (
        endedLine ||
        Math.abs(run.y - lineY) > Math.max(lineHeight, height) * NEW_LINE_RATIO
      ) {
        if (line.trim()) lines.push(line);
        const drop = lineY - run.y;
        if (lines.length > 0 && lineHeight > 0 && drop > lineHeight * PARAGRAPH_RATIO) {
          lines.push('');
        }
        line = '';
        lineHeight = height;
      } else {
        if (previous && needsSpace(previous, run, Math.max(lineHeight, height))) line += ' ';
        lineHeight = Math.max(lineHeight, height);
      }
      lineY = lineY === null || line === '' ? run.y : lineY;
      line += run.str;
      previous = run;
      endedLine = false;
    }
    if (run.hasEOL) endedLine = true;
  }
  if (line.trim()) lines.push(line);
  return lines;
}

function needsSpace(previous: TextRun, run: TextRun, height: number): boolean {
  if (/\s$/.test(previous.str) || /^\s/.test(run.str)) return false;
  const gap = run.x - (previous.x + previous.width);
  return gap > height * SPACE_RATIO;
}

/** Pages' lines as one text: pages are separated by a blank line. */
export function documentText(pages: readonly string[][]): string {
  return pages
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join('\n'))
    .join('\n\n');
}

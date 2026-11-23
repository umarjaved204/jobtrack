import { normaliseResumeText } from '../resume-schema';

/*
 * Text extracted from a document, tidied into what a person would have pasted, then
 * normalised exactly like pasted text (resume-schema.ts), so the limit and what the
 * server stores match what the user reviews.
 */

/**
 * Bullet glyphs at the start of a line: • ▪ ◦ ‣ ∙ ● ○ ■ □ ◆ ◇ ▸ ► ➢ ➤ ✓ ✔ ·, and the
 * private-use code points Symbol and Wingdings bullets come out as when Word exports a
 * PDF (U+F0A7, U+F0B7, U+F0D8, U+F076, U+F0FC). Written as escapes: several of these
 * look alike or are invisible. Plain "-" and "*" are left alone: they already read as
 * list markers.
 */
const BULLET =
  /^[ \t]*[\u2022\u25AA\u25E6\u2023\u2219\u25CF\u25CB\u25A0\u25A1\u25C6\u25C7\u25B8\u25BA\u27A2\u27A4\u2713\u2714\u00B7\uF0A7\uF0B7\uF0D8\uF076\uF0FC][ \t]*/gm;

export function cleanExtractedText(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, '\n')
    // Invisible characters PDFs and Word files carry: soft hyphens, zero-width spaces.
    .replace(/\u00AD|\u200B|\u200C|\u200D|\uFEFF/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(BULLET, '- ')
    // A word split at a line end ("manag-\nement"): rejoin when the next line carries on
    // in lower case. A hyphenated compound broken there loses its hyphen too; the text is
    // reviewed before saving.
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    // Column layouts space words apart with runs of spaces or tabs.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, '')
    // At most one blank line in a row.
    .replace(/\n{3,}/g, '\n\n');
  return normaliseResumeText(text);
}

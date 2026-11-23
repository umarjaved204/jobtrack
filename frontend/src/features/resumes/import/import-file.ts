import { MAX_LABEL_CHARS, MAX_RESUME_CHARS } from '../resume-schema';
import { cleanExtractedText } from './clean-text';
import type { PdfResult } from './extract-pdf';
import { detectFileType, extensionOf, SIGNATURE_BYTES } from './file-type';

/*
 * A resume file to text, entirely in the browser: the file is never uploaded. The text
 * fills the form for review; only what the user then saves is stored, and the file name
 * only suggests a label.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Fewer readable characters than this from a PDF: it's a scan or a picture of text. */
export const MIN_TEXT_CHARS = 20;

export type ImportRefusal =
  | 'too-big'
  | 'unsupported'
  | 'mismatch'
  | 'legacy-or-protected-word'
  | 'password'
  | 'no-text'
  | 'too-long'
  | 'unreadable';

export type ImportResult =
  | { status: 'ok'; text: string; label: string }
  | { status: 'refused'; reason: ImportRefusal; message: string };

export const REFUSAL_MESSAGES: Record<ImportRefusal, (name: string) => string> = {
  'too-big': () =>
    'This file is over 5 MB, which is unusual for a resume. Export it again, or paste the text.',
  unsupported: () => 'Choose a PDF or a Word (.docx) file, or paste the text.',
  mismatch: (name) =>
    `This file’s contents don’t match its name (.${extensionOf(name)}). Save it again as PDF or Word, or paste the text.`,
  'legacy-or-protected-word': () =>
    'This is an older .doc file or a password-protected Word document. Save it as .docx without a password, or paste the text.',
  password: () => 'This PDF is password-protected. Remove the password, or paste the text.',
  'no-text': () =>
    'This PDF has no text to read: it’s probably a scan or a photo. Paste the text instead.',
  'too-long': () =>
    `This file has more than ${MAX_RESUME_CHARS.toLocaleString('en-GB')} characters of text, the most a resume version can hold. Paste the part you need.`,
  unreadable: () => 'Couldn’t read this file. It may be damaged: save it again, or paste the text.',
};

export type Extractors = {
  pdf: (
    data: ArrayBuffer,
    options: { maxChars: number; measure: (text: string) => number },
  ) => Promise<PdfResult>;
  docx: (data: ArrayBuffer) => Promise<string>;
};

/** Loaded on first use, so neither parser is in the page's bundle. */
const defaultExtractors: Extractors = {
  pdf: async (data, options) => (await import('./extract-pdf')).extractPdfText(data, options),
  docx: async (data) => (await import('./extract-docx')).extractDocxText(data),
};

/** "Sam_Okafor-CV 2026.pdf" → "Sam Okafor-CV 2026". */
export function labelFromFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_CHARS);
}

export async function importResumeFile(
  file: File,
  extractors: Extractors = defaultExtractors,
): Promise<ImportResult> {
  const refuse = (reason: ImportRefusal): ImportResult => ({
    status: 'refused',
    reason,
    message: REFUSAL_MESSAGES[reason](file.name),
  });

  if (file.size > MAX_FILE_BYTES) return refuse('too-big');
  if (file.size === 0) return refuse('unreadable');

  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    return refuse('unreadable');
  }
  const head = new Uint8Array(data, 0, Math.min(data.byteLength, SIGNATURE_BYTES));
  const type = detectFileType(head, file.name);
  if ('refusal' in type) return refuse(type.refusal);

  const measure = (raw: string) => cleanExtractedText(raw).length;
  let raw: string;
  try {
    if (type.kind === 'pdf') {
      const result = await extractors.pdf(data, { maxChars: MAX_RESUME_CHARS, measure });
      if (result.status === 'password') return refuse('password');
      raw = result.text;
    } else {
      raw = await extractors.docx(data);
    }
  } catch {
    return refuse('unreadable');
  }

  const text = cleanExtractedText(raw);
  if (text.length > MAX_RESUME_CHARS) return refuse('too-long');
  if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
    return refuse(type.kind === 'pdf' ? 'no-text' : 'unreadable');
  }
  return { status: 'ok', text, label: labelFromFileName(file.name) };
}

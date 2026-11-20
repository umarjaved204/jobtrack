import { describe, expect, it, vi } from 'vitest';

import { fileFrom, makeDocx, makePdf, pdfLines } from '@/test/documents';

import { MAX_LABEL_CHARS, MAX_RESUME_CHARS } from '../resume-schema';
import { extractPdfText, type PdfjsModule } from './extract-pdf';
import {
  type Extractors,
  importResumeFile,
  labelFromFileName,
  MAX_FILE_BYTES,
  REFUSAL_MESSAGES,
} from './import-file';

const TEXT = 'Priya Raman\nData analyst, Manchester\nPython, SQL and Power BI';
const PDF = makePdf([pdfLines(TEXT.split('\n'))]);
const DOCX = makeDocx(TEXT.split('\n'));

/** Parsers that return fixed text, so each test controls what "the file" contains. */
function fakeExtractors(text = TEXT): Extractors & {
  pdf: ReturnType<typeof vi.fn<Extractors['pdf']>>;
  docx: ReturnType<typeof vi.fn<Extractors['docx']>>;
} {
  return {
    pdf: vi.fn<Extractors['pdf']>(() =>
      Promise.resolve({ status: 'text', text, pages: 1, truncated: false }),
    ),
    docx: vi.fn<Extractors['docx']>(() => Promise.resolve(text)),
  };
}

describe('importResumeFile', () => {
  it('reads a PDF or a Word file by its signature and suggests a label', async () => {
    const parsers = fakeExtractors();
    expect(await importResumeFile(fileFrom(PDF, 'Priya_Raman_CV.pdf'), parsers)).toEqual({
      status: 'ok',
      text: TEXT,
      label: 'Priya Raman CV',
    });
    expect(await importResumeFile(fileFrom(DOCX, 'Data CV.docx'), parsers)).toMatchObject({
      status: 'ok',
      label: 'Data CV',
    });
    expect(parsers.pdf).toHaveBeenCalledTimes(1);
    expect(parsers.docx).toHaveBeenCalledTimes(1);
  });

  it('refuses a file over 5 MB without reading it', async () => {
    const parsers = fakeExtractors();
    const big = fileFrom(new Uint8Array(MAX_FILE_BYTES + 1), 'cv.pdf');
    const read = vi.spyOn(big, 'arrayBuffer');
    expect(await importResumeFile(big, parsers)).toMatchObject({ reason: 'too-big' });
    expect(read).not.toHaveBeenCalled();
    expect(parsers.pdf).not.toHaveBeenCalled();
  });

  it('accepts a file of exactly 5 MB', async () => {
    const exact = new Uint8Array(MAX_FILE_BYTES);
    exact.set(PDF);
    expect(await importResumeFile(fileFrom(exact, 'cv.pdf'), fakeExtractors())).toMatchObject({
      status: 'ok',
    });
  });

  it('refuses mismatched, old, protected and unsupported files before parsing', async () => {
    const parsers = fakeExtractors();
    const cases: [File, string][] = [
      [fileFrom(DOCX, 'cv.pdf'), 'mismatch'],
      [fileFrom(PDF, 'cv.docx'), 'mismatch'],
      [fileFrom(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'cv.doc'), 'legacy-or-protected-word'], // prettier-ignore
      [fileFrom(new TextEncoder().encode('Priya Raman, analyst'), 'cv.txt'), 'unsupported'],
      [fileFrom(new Uint8Array(), 'cv.pdf'), 'unreadable'],
    ];
    for (const [file, reason] of cases) {
      expect(await importResumeFile(file, parsers), file.name).toMatchObject({ reason });
    }
    expect(parsers.pdf).not.toHaveBeenCalled();
    expect(parsers.docx).not.toHaveBeenCalled();
  });

  it('names the extension in a mismatch message', async () => {
    const result = await importResumeFile(fileFrom(DOCX, 'cv.pdf'), fakeExtractors());
    expect(result).toMatchObject({
      message:
        'This file’s contents don’t match its name (.pdf). Save it again as PDF or Word, or paste the text.',
    });
  });

  it('cleans and normalises the text like pasted text', async () => {
    const result = await importResumeFile(
      fileFrom(PDF, 'cv.pdf'),
      fakeExtractors('\r\n• Built dashboards  in Power BI\r\n• Automated re-\nports with Python\n'),
    );
    expect(result).toMatchObject({
      text: '- Built dashboards in Power BI\n- Automated reports with Python',
    });
  });

  it('says a password-protected PDF is protected', async () => {
    const parsers = fakeExtractors();
    parsers.pdf.mockResolvedValue({ status: 'password' });
    expect(await importResumeFile(fileFrom(PDF, 'cv.pdf'), parsers)).toMatchObject({
      reason: 'password',
      message: 'This PDF is password-protected. Remove the password, or paste the text.',
    });
  });

  it('calls a PDF without text a scan, and a Word file without text unreadable', async () => {
    expect(await importResumeFile(fileFrom(PDF, 'cv.pdf'), fakeExtractors('  \n '))).toMatchObject({
      reason: 'no-text',
    });
    expect(await importResumeFile(fileFrom(DOCX, 'cv.docx'), fakeExtractors(''))).toMatchObject({
      reason: 'unreadable',
    });
  });

  it('refuses text over the limit, counted after clean-up', async () => {
    const atLimit = `${'a'.repeat(MAX_RESUME_CHARS - 2)}  b`; // collapses to the limit
    expect(await importResumeFile(fileFrom(DOCX, 'cv.docx'), fakeExtractors(atLimit))).toMatchObject({ status: 'ok' }); // prettier-ignore
    const over = 'a'.repeat(MAX_RESUME_CHARS + 1);
    expect(await importResumeFile(fileFrom(DOCX, 'cv.docx'), fakeExtractors(over))).toMatchObject({
      reason: 'too-long',
    });
  });

  it('calls a parser failure unreadable', async () => {
    const parsers = fakeExtractors();
    parsers.docx.mockRejectedValue(new Error('end of central directory not found'));
    expect(await importResumeFile(fileFrom(DOCX, 'cv.docx'), parsers)).toMatchObject({
      reason: 'unreadable',
    });
  });

  it('has a message for every refusal', () => {
    for (const message of Object.values(REFUSAL_MESSAGES)) {
      expect(message('cv.pdf')).toMatch(/paste the (text|part)/i);
    }
  });
});

describe('labelFromFileName', () => {
  it('drops the extension and underscores, and fits the label limit', () => {
    expect(labelFromFileName('Priya_Raman__CV-2026.final.pdf')).toBe('Priya Raman CV-2026.final');
    expect(labelFromFileName('cv')).toBe('cv');
    expect(labelFromFileName(`${'x'.repeat(150)}.pdf`)).toHaveLength(MAX_LABEL_CHARS);
  });
});

// ------------------------------------------------------------- pdf.js adapter rules

/** A stand-in for pdf.js: pages of fixed text, or a password error. */
function fakePdfjs({ pages = 1, pageText = 'line', password = false } = {}) {
  class PasswordException extends Error {}
  const getPage = vi.fn((n: number) =>
    Promise.resolve({
      getTextContent: () =>
        Promise.resolve({
          items: [{ str: `${pageText} ${n}`, transform: [1, 0, 0, 1, 56, 780], width: 10, height: 11, hasEOL: false }],
        }),
      cleanup: () => true,
    }),
  ); // prettier-ignore
  const destroy = vi.fn(() => Promise.resolve());
  const module = {
    PasswordException,
    VerbosityLevel: { ERRORS: 0 },
    getDocument: () => ({
      promise: password
        ? Promise.reject(new PasswordException('No password given'))
        : Promise.resolve({ numPages: pages, getPage }),
      destroy,
    }),
  };
  return { load: () => Promise.resolve(module as unknown as PdfjsModule), getPage, destroy };
}

describe('extractPdfText', () => {
  const measure = (text: string) => text.length;

  it('stops reading pages once the text is over the limit', async () => {
    const pdfjs = fakePdfjs({ pages: 50, pageText: 'x'.repeat(1000) });
    const result = await extractPdfText(new ArrayBuffer(8), {
      maxChars: 3500,
      measure,
      loadPdfjs: pdfjs.load,
    });
    expect(result).toMatchObject({ status: 'text', pages: 50, truncated: true });
    expect(pdfjs.getPage).toHaveBeenCalledTimes(4); // 4 × ~1,000 characters > 3,500
    expect(pdfjs.destroy).toHaveBeenCalled();
  });

  it('reads every page of a document within the limit', async () => {
    const pdfjs = fakePdfjs({ pages: 3 });
    const result = await extractPdfText(new ArrayBuffer(8), {
      maxChars: 3500,
      measure,
      loadPdfjs: pdfjs.load,
    });
    expect(result).toEqual({
      status: 'text',
      text: 'line 1\n\nline 2\n\nline 3',
      pages: 3,
      truncated: false,
    });
  });

  it('reports pdf.js’s password error as a password, and still cleans up', async () => {
    const pdfjs = fakePdfjs({ password: true });
    const result = await extractPdfText(new ArrayBuffer(8), {
      maxChars: 3500,
      measure,
      loadPdfjs: pdfjs.load,
    });
    expect(result).toEqual({ status: 'password' });
    expect(pdfjs.destroy).toHaveBeenCalled();
  });
});

import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';

import { documentText, pageLines, type TextRun } from './pdf-lines';

/*
 * PDF text through pdf.js, loaded only when a PDF is picked (it's large). Its worker is
 * bundled as one of our own assets (`?url`), so it loads same-origin, as cross-origin
 * isolation (COEP require-corp) requires.
 *
 * CVE-2024-4367 (arbitrary script through a crafted font) came from pdf.js compiling font
 * glyphs with `eval`. The fix (4.2.67) removed that code, and v6 has no `eval` or
 * `new Function` at all, so its old `isEvalSupported` switch no longer exists. A test
 * (no-eval.test.ts) fails if a future pdf.js brings dynamic code back.
 */

export type PdfjsModule = typeof import('pdfjs-dist');

export type PdfResult =
  { status: 'text'; text: string; pages: number; truncated: boolean } | { status: 'password' };

async function loadBrowserPdfjs(): Promise<PdfjsModule> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return 'str' in item;
}

function toRun(item: TextItem): TextRun {
  return {
    str: item.str,
    x: Number(item.transform[4]),
    y: Number(item.transform[5]),
    width: item.width,
    height: item.height,
    hasEOL: item.hasEOL,
  };
}

/**
 * Reads page by page and stops once the text so far is longer than `maxChars` (it's
 * refused then anyway), so a huge document isn't read to the end.
 */
export async function extractPdfText(
  data: ArrayBuffer,
  {
    maxChars,
    measure,
    loadPdfjs = loadBrowserPdfjs,
  }: {
    maxChars: number;
    /** The length the limit applies to (after clean-up and normalisation). */
    measure: (text: string) => number;
    loadPdfjs?: () => Promise<PdfjsModule>;
  },
): Promise<PdfResult> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    // Text only: no fonts are loaded into the page, nothing is rendered.
    disableFontFace: true,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  try {
    const doc = await task.promise;
    const pages: string[][] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      pages.push(pageLines(content.items.filter(isTextItem).map(toRun)));
      page.cleanup();
      const text = documentText(pages);
      if (number < doc.numPages && measure(text) > maxChars) {
        return { status: 'text', text, pages: doc.numPages, truncated: true };
      }
    }
    return { status: 'text', text: documentText(pages), pages: doc.numPages, truncated: false };
  } catch (error) {
    if (error instanceof pdfjs.PasswordException) return { status: 'password' };
    throw error;
  } finally {
    await task.destroy();
  }
}

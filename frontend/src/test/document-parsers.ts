import type { MammothModule } from '@/features/resumes/import/extract-docx';
import type { PdfjsModule } from '@/features/resumes/import/extract-pdf';

/*
 * The real document parsers, loaded the way tests can run them. pdf.js runs its legacy
 * build (the one meant for Node) with the worker on the main thread; the browser loads
 * the same code through a real Worker (extract-pdf.ts). Mammoth runs its browser bundle,
 * the code the app ships: its Node build reads paths and Buffers, not the ArrayBuffer a
 * File gives.
 */

export async function loadLegacyPdfjs(): Promise<PdfjsModule> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js uses a worker already loaded on this thread when it finds one here.
  Object.assign(globalThis, {
    pdfjsWorker: await import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  });
  return pdfjs as unknown as PdfjsModule;
}

const MAMMOTH_BROWSER = 'mammoth/mammoth.browser.js';

export async function loadBrowserMammoth(): Promise<MammothModule> {
  const bundle = (await import(/* @vite-ignore */ MAMMOTH_BROWSER)) as { default: MammothModule };
  return bundle.default;
}

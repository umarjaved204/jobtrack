import { describe, expect, it } from 'vitest';

import { fileFrom, makeDocx, makePdf, pdfLines } from '@/test/documents';

import { extractDocxText, type MammothModule } from './extract-docx';
import { extractPdfText, type PdfjsModule } from './extract-pdf';
import { type Extractors, importResumeFile } from './import-file';

/*
 * The real parsers on synthetic files (src/test/documents.ts). pdf.js runs its legacy
 * build here (the one meant for Node) with the worker on the main thread: the browser
 * loads the same code through a real Worker (extract-pdf.ts). Mammoth runs its browser
 * bundle, the code the app ships: its Node build reads paths and Buffers, not the
 * ArrayBuffer a File gives.
 */
const MAMMOTH_BROWSER = 'mammoth/mammoth.browser.js';

async function loadBrowserMammoth(): Promise<MammothModule> {
  const bundle = (await import(/* @vite-ignore */ MAMMOTH_BROWSER)) as { default: MammothModule };
  return bundle.default;
}
async function loadLegacyPdfjs(): Promise<PdfjsModule> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js uses a worker already loaded on this thread when it finds one here.
  Object.assign(globalThis, {
    pdfjsWorker: await import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  });
  return pdfjs as unknown as PdfjsModule;
}

const realParsers: Extractors = {
  pdf: (data, options) => extractPdfText(data, { ...options, loadPdfjs: loadLegacyPdfjs }),
  docx: (data) => extractDocxText(data, { load: loadBrowserMammoth }),
};

const RESUME_LINES = [
  'Priya Raman',
  'Data analyst, Manchester',
  'Experience',
  '• Built weekly sales dashboards in Power BI for a retailer’s',
  'regional managers, replacing twelve spreadsheets.',
  '• Automated stock reports with Python and SQL; cut prepar-',
  'ation time from two days to an hour.',
];

describe('real files', () => {
  it('rebuilds a PDF’s lines, bullets and hyphenation', async () => {
    const pdf = makePdf([pdfLines(RESUME_LINES)]);
    const result = await importResumeFile(fileFrom(pdf, 'Priya_Raman CV.pdf'), realParsers);

    expect(result).toEqual({
      status: 'ok',
      label: 'Priya Raman CV',
      text: [
        'Priya Raman',
        'Data analyst, Manchester',
        'Experience',
        '- Built weekly sales dashboards in Power BI for a retailer’s',
        'regional managers, replacing twelve spreadsheets.',
        '- Automated stock reports with Python and SQL; cut preparation time from two days to an hour.',
      ].join('\n'),
    });
  });

  it('keeps pages apart and finds words split into runs on one line', async () => {
    const pdf = makePdf([
      [
        { text: 'Skills:', x: 56, y: 780 },
        { text: 'Python,', x: 100, y: 780 },
        { text: 'SQL', x: 142, y: 780 },
      ],
      pdfLines(['Education', 'BSc Mathematics, University of Leeds']),
    ]);
    const result = await importResumeFile(fileFrom(pdf, 'cv.pdf'), realParsers);
    expect(result).toMatchObject({
      status: 'ok',
      text: 'Skills: Python, SQL\n\nEducation\nBSc Mathematics, University of Leeds',
    });
  });

  it('reads a Word document one paragraph per line', async () => {
    const docx = makeDocx(['Priya Raman', 'Data analyst, Manchester', '', 'Experience']);
    const result = await importResumeFile(fileFrom(docx, 'priya-raman.docx'), realParsers);
    expect(result).toEqual({
      status: 'ok',
      label: 'priya-raman',
      text: 'Priya Raman\nData analyst, Manchester\n\nExperience',
    });
  });

  it('calls a PDF without text a scan', async () => {
    const result = await importResumeFile(fileFrom(makePdf([[]]), 'scan.pdf'), realParsers);
    expect(result).toMatchObject({ status: 'refused', reason: 'no-text' });
  });

  it('calls a damaged file unreadable', async () => {
    const broken = makePdf([pdfLines(RESUME_LINES)]).slice(0, 120);
    const result = await importResumeFile(fileFrom(broken, 'cv.pdf'), realParsers);
    expect(result).toMatchObject({ status: 'refused', reason: 'unreadable' });
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fileFrom, makeDocx, makePdf, pdfLines } from '@/test/documents';
import { makeResume, mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend } from '@/test/msw';
import { findPageHeading, renderApp } from '@/test/render-app';

/*
 * The real import pipeline through the real page: the parsers only swap their loaders
 * for the builds tests can run (src/test/document-parsers.ts).
 */
vi.mock('./import/extract-pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./import/extract-pdf')>();
  const { loadLegacyPdfjs } = await import('@/test/document-parsers');
  return {
    ...actual,
    extractPdfText: (...[data, options]: Parameters<typeof actual.extractPdfText>) =>
      actual.extractPdfText(data, { ...options, loadPdfjs: loadLegacyPdfjs }),
  };
});
vi.mock('./import/extract-docx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./import/extract-docx')>();
  const { loadBrowserMammoth } = await import('@/test/document-parsers');
  return {
    ...actual,
    extractDocxText: (data: ArrayBuffer) =>
      actual.extractDocxText(data, { load: loadBrowserMammoth }),
  };
});

const LINES = [
  'Priya Raman',
  'Data analyst, Manchester',
  '• Built weekly sales dashboards in Power BI for regional managers.',
  '• Automated stock reports with Python and SQL.',
];
const IMPORTED_TEXT = [
  'Priya Raman',
  'Data analyst, Manchester',
  '- Built weekly sales dashboards in Power BI for regional managers.',
  '- Automated stock reports with Python and SQL.',
].join('\n');
const PDF_NAME = 'Priya_Raman_CV.pdf';
const pdfFile = () => fileFrom(makePdf([pdfLines(LINES)]), PDF_NAME, 'application/pdf');

let backend: ReturnType<typeof mockApplicationsBackend>;

beforeEach(() => {
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend({ resumes: [] });
});

async function openAddPanel() {
  const user = userEvent.setup();
  renderApp('/resumes');
  await findPageHeading('Resume versions');
  await user.click(await screen.findByRole('button', { name: 'Add a version' }));
  const form = await screen.findByRole('dialog', { name: 'Add a resume version' });
  return { user, form };
}
const status = (form: HTMLElement) => within(form).getByRole('status');

describe('importing a resume file', () => {
  it('fills the text and the name from a PDF, for review before saving', async () => {
    const { user, form } = await openAddPanel();
    const picker = within(form).getByLabelText('Import from a file');
    expect(picker).toHaveAccessibleDescription(
      'PDF or Word (.docx), up to 5 MB. It’s read on this device, never uploaded.',
    );

    await user.upload(picker, pdfFile());

    await waitFor(() =>
      expect(status(form)).toHaveTextContent(`Filled in the text from ${PDF_NAME}.`),
    );
    const text = within(form).getByLabelText('Resume text');
    expect(text).toHaveValue(IMPORTED_TEXT);
    expect(text).toHaveFocus();
    expect(within(form).getByLabelText('Name')).toHaveValue('Priya Raman CV');
    expect(within(form).getByText(`${IMPORTED_TEXT.length} of 50,000 characters`)).toBeVisible();

    await user.click(within(form).getByRole('button', { name: 'Add version' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(backend.resumes).toHaveLength(1);
    expect(backend.resumes[0]).toMatchObject({
      label: 'Priya Raman CV',
      content_text: IMPORTED_TEXT,
    });
    // Only the reviewed text and the (editable) name are saved: never the file itself or its name.
    expect(JSON.stringify(backend.resumes)).not.toContain(PDF_NAME);
  });

  it('reads a Word document too', async () => {
    const { user, form } = await openAddPanel();
    const docx = fileFrom(makeDocx(['Priya Raman', 'Data analyst, Manchester']), 'priya.docx');
    await user.upload(within(form).getByLabelText('Import from a file'), docx);

    await waitFor(() =>
      expect(within(form).getByLabelText('Resume text')).toHaveValue(
        'Priya Raman\nData analyst, Manchester',
      ),
    );
  });

  it('keeps a name the user already typed', async () => {
    const { user, form } = await openAddPanel();
    await user.type(within(form).getByLabelText('Name'), 'Data, retail focus');
    await user.upload(within(form).getByLabelText('Import from a file'), pdfFile());

    await waitFor(() =>
      expect(within(form).getByLabelText('Resume text')).toHaveValue(IMPORTED_TEXT),
    );
    expect(within(form).getByLabelText('Name')).toHaveValue('Data, retail focus');
  });

  it('announces a refusal and changes nothing', async () => {
    const { user, form } = await openAddPanel();
    const notReallyPdf = fileFrom(new TextEncoder().encode('Priya Raman, analyst'), 'cv.pdf');
    await user.upload(within(form).getByLabelText('Import from a file'), notReallyPdf);

    await waitFor(() =>
      expect(status(form)).toHaveTextContent(
        'Choose a PDF or a Word (.docx) file, or paste the text.',
      ),
    );
    expect(within(form).getByLabelText('Resume text')).toHaveValue('');
    expect(within(form).getByLabelText('Name')).toHaveValue('');

    // A refused file isn't an edit: closing doesn't ask to discard anything.
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('asks before replacing text already in the box', async () => {
    const { user, form } = await openAddPanel();
    const text = within(form).getByLabelText('Resume text');
    text.focus();
    await user.paste('Priya Raman\nAnalyst (pasted)');

    await user.upload(within(form).getByLabelText('Import from a file'), pdfFile());
    const keep = await screen.findByRole('alertdialog', {
      name: 'Replace the text you’ve entered?',
    });
    expect(keep).toHaveTextContent(`The text from ${PDF_NAME} will replace what’s in the box now.`);
    await user.click(within(keep).getByRole('button', { name: 'Keep my text' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(text).toHaveValue('Priya Raman\nAnalyst (pasted)');

    await user.upload(within(form).getByLabelText('Import from a file'), pdfFile());
    const replace = await screen.findByRole('alertdialog');
    await user.click(within(replace).getByRole('button', { name: 'Replace the text' }));
    await waitFor(() => expect(text).toHaveValue(IMPORTED_TEXT));
  });

  it('isn’t offered when editing or duplicating a version', async () => {
    backend = mockApplicationsBackend({
      resumes: [makeResume({ id: 'resume-v1', label: 'Data v1' })],
    });
    const user = userEvent.setup();
    renderApp('/resumes?version=resume-v1');
    await findPageHeading('Resume versions');
    const article = await screen.findByRole('article');

    await user.click(within(article).getByRole('button', { name: 'Edit' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit Data v1' });
    expect(within(edit).queryByLabelText('Import from a file')).not.toBeInTheDocument();
    await user.click(within(edit).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(article).getByRole('button', { name: 'Duplicate as new version' }));
    const duplicate = await screen.findByRole('dialog', { name: 'Duplicate as a new version' });
    expect(within(duplicate).queryByLabelText('Import from a file')).not.toBeInTheDocument();
  });
});

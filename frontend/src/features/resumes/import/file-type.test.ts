import { describe, expect, it } from 'vitest';

import { detectFileType, extensionOf } from './file-type';

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  );
const PDF = bytes('%PDF-1.7\n');
const ZIP = bytes('PK', 3, 4, 20, 0);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

describe('detectFileType', () => {
  it('trusts the signature that agrees with the name', () => {
    expect(detectFileType(PDF, 'cv.pdf')).toEqual({ kind: 'pdf' });
    expect(detectFileType(PDF, 'CV.PDF')).toEqual({ kind: 'pdf' });
    expect(detectFileType(ZIP, 'cv.docx')).toEqual({ kind: 'docx' });
  });

  it('finds a PDF header after leading bytes, as PDF readers do', () => {
    expect(detectFileType(bytes('\n\n', 0xef, 0xbb, 0xbf, '%PDF-1.4'), 'cv.pdf')).toEqual({
      kind: 'pdf',
    });
  });

  it('goes by the contents when the name claims nothing', () => {
    expect(detectFileType(PDF, 'cv')).toEqual({ kind: 'pdf' });
    expect(detectFileType(PDF, 'cv.download')).toEqual({ kind: 'pdf' });
    expect(detectFileType(ZIP, 'cv')).toEqual({ kind: 'docx' });
  });

  it('refuses contents that contradict the name', () => {
    expect(detectFileType(ZIP, 'cv.pdf')).toEqual({ refusal: 'mismatch' });
    expect(detectFileType(PDF, 'cv.docx')).toEqual({ refusal: 'mismatch' });
    expect(detectFileType(PDF, 'cv.doc')).toEqual({ refusal: 'mismatch' });
  });

  it('recognises old .doc files and password-protected Word files', () => {
    expect(detectFileType(OLE, 'cv.doc')).toEqual({ refusal: 'legacy-or-protected-word' });
    expect(detectFileType(OLE, 'cv.docx')).toEqual({ refusal: 'legacy-or-protected-word' });
  });

  it('refuses other formats, zipped or not', () => {
    expect(detectFileType(ZIP, 'cv.xlsx')).toEqual({ refusal: 'unsupported' });
    expect(detectFileType(ZIP, 'cv.odt')).toEqual({ refusal: 'unsupported' });
    expect(detectFileType(bytes('{\\rtf1'), 'cv.rtf')).toEqual({ refusal: 'unsupported' });
    expect(detectFileType(bytes(0x89, 'PNG'), 'cv.pdf')).toEqual({ refusal: 'unsupported' });
    expect(detectFileType(bytes(), 'cv.pdf')).toEqual({ refusal: 'unsupported' });
  });
});

describe('extensionOf', () => {
  it('is the lower-case extension, or nothing', () => {
    expect(extensionOf('Résumé.Final.PDF')).toBe('pdf');
    expect(extensionOf('cv')).toBe('');
    expect(extensionOf('.docx')).toBe(''); // a hidden file's name, not an extension
  });
});

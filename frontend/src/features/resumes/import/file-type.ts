/*
 * What a chosen file really is, from its first bytes, checked against its name. A name
 * or a MIME type is only a claim (a renamed file, a browser guessing from the extension);
 * the signature says what the parsers will actually get.
 */

export type ResumeFileKind = 'pdf' | 'docx';

export type FileTypeRefusal =
  /** Neither a PDF nor a Word document. */
  | 'unsupported'
  /** The contents contradict the name: a PDF named .docx, a Word file named .pdf. */
  | 'mismatch'
  /** An OLE container: an old .doc, or a .docx saved with a password (Word encrypts those). */
  | 'legacy-or-protected-word';

export type FileTypeResult = { kind: ResumeFileKind } | { refusal: FileTypeRefusal };

/** How much of the file to read: PDF readers accept the header within the first 1 KB. */
export const SIGNATURE_BYTES = 1024;

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04": .docx is a zip
const OLE_HEADER = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, signature: number[], at = 0): boolean {
  return signature.every((byte, i) => bytes[at + i] === byte);
}

function containsPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, SIGNATURE_BYTES) - PDF_HEADER.length;
  for (let at = 0; at <= end; at++) if (startsWith(bytes, PDF_HEADER, at)) return true;
  return false;
}

/** The lower-case extension without the dot, or '' when the name has none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The kinds this name claims. An unknown or missing extension claims nothing. */
const CLAIMS: Record<string, string> = { pdf: 'pdf', docx: 'docx', doc: 'doc' };

export function detectFileType(head: Uint8Array, name: string): FileTypeResult {
  const claimed = CLAIMS[extensionOf(name)];
  const contradicts = (actual: string) => claimed !== undefined && claimed !== actual;

  if (startsWith(head, OLE_HEADER)) return { refusal: 'legacy-or-protected-word' };
  if (startsWith(head, ZIP_HEADER)) {
    if (contradicts('docx')) return { refusal: 'mismatch' };
    // Other zip formats (.xlsx, .odt, .pages) aren't Word documents.
    return claimed === 'docx' || extensionOf(name) === ''
      ? { kind: 'docx' }
      : { refusal: 'unsupported' };
  }
  if (containsPdfHeader(head)) {
    return contradicts('pdf') ? { refusal: 'mismatch' } : { kind: 'pdf' };
  }
  return { refusal: 'unsupported' };
}

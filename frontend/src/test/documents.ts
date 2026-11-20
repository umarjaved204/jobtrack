/*
 * Synthetic PDF and Word files for the resume import tests, built in code so every
 * fixture's content is visible here and invented (never a real person's resume).
 *
 * - `makePdf`: a minimal PDF 1.4 with Helvetica (a standard font, nothing embedded) in
 *   WinAnsiEncoding, one text run per entry at the given position, like a real
 *   generator's output. y grows upwards from the bottom of an A4 page (842 pt).
 * - `makeDocx`: a minimal .docx (a stored, uncompressed zip with the three parts Word
 *   needs), one paragraph per entry.
 */

export type PdfRun = { text: string; x: number; y: number; size?: number };

/** WinAnsi (cp1252) bytes for the characters the fixtures use beyond Latin-1. */
const WIN_ANSI: Record<string, number> = { '•': 0x95, '’': 0x92, '–': 0x96, '—': 0x97 };

function winAnsi(text: string): number[] {
  return [...text].map((char) => {
    const mapped = WIN_ANSI[char];
    if (mapped !== undefined) return mapped;
    const code = char.charCodeAt(0);
    if (code > 0xff) throw new Error(`No WinAnsi byte for ${char}`);
    return code;
  });
}

/** A PDF literal string: ( ) and \ escaped, bytes as Latin-1 characters. */
function pdfString(text: string): string {
  const escaped = winAnsi(text)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .replace(/[\\()]/g, (c) => `\\${c}`);
  return `(${escaped})`;
}

function latin1(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
}

export function makePdf(pages: PdfRun[][]): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length; // 1-based ids

  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // the page tree, filled in once the page ids are known
  const font = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const pageIds = pages.map((runs) => {
    const stream = runs
      .map(
        ({ text, x, y, size = 11 }) =>
          `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm ${pdfString(text)} Tj ET`,
      )
      .join('\n');
    const content = add(`<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
    );
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(out);
}

/** Lines of text on one page, 14 pt apart from the top margin, as a simple generator lays them out. */
export function pdfLines(lines: string[], { top = 780, left = 56, leading = 14 } = {}): PdfRun[] {
  return lines.map((text, i) => ({ text, x: left, y: top - i * leading }));
}

// ------------------------------------------------------------------------------ docx

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip with every entry stored (no compression): enough for any zip reader. */
function makeZip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function makeDocx(paragraphs: string[]): Uint8Array<ArrayBuffer> {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${xml(p)}</w:t></w:r></w:p>`)
    .join('');
  return makeZip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  });
}

/** A File the way an <input type="file"> hands it over. */
export function fileFrom(bytes: Uint8Array<ArrayBuffer>, name: string, type = ''): File {
  return new File([bytes], name, { type });
}

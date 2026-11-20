/*
 * Word (.docx) text through mammoth, loaded only when a Word file is picked. In the
 * browser build mammoth refuses linked (external) files outright, so CVE-2025-11849
 * (reading local files through a linked image) can't apply, and raw text extraction
 * doesn't read images at all.
 */

export type MammothModule = typeof import('mammoth');

async function loadMammoth(): Promise<MammothModule> {
  return (await import('mammoth')).default;
}

/**
 * Mammoth reads the whole document at once (it can't stop early); files are capped at
 * 5 MB before this runs. It ends every paragraph with a blank line: one paragraph per
 * line reads like pasted text, and a deliberately empty paragraph stays a blank line.
 */
export async function extractDocxText(
  data: ArrayBuffer,
  { load = loadMammoth }: { load?: () => Promise<MammothModule> } = {},
): Promise<string> {
  const mammoth = await load();
  const { value } = await mammoth.extractRawText({ arrayBuffer: data });
  return value.replace(/\n\n/g, '\n');
}

/*
 * Vectors on the wire (POST /match): base64 of little-endian float32 values, row-major.
 * About 4x smaller than JSON numbers, and exact. DataView fixes the byte order, so this
 * doesn't depend on the device's endianness.
 */

const CHUNK = 0x8000; // String.fromCharCode's argument count stays well under engine limits

export function encodeVectors(rows: readonly Float32Array[], dim: number): string {
  const bytes = new Uint8Array(rows.length * dim * 4);
  const view = new DataView(bytes.buffer);
  rows.forEach((row, r) => {
    if (row.length !== dim) throw new Error(`Row ${r} has ${row.length} values, not ${dim}`);
    for (let i = 0; i < dim; i++) view.setFloat32((r * dim + i) * 4, row[i] ?? 0, true);
  });
  let binary = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}

/** The inverse, for tests and the fake backend. */
export function decodeVectors(encoded: string, dim: number): Float32Array[] {
  const binary = atob(encoded);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const rows: Float32Array[] = [];
  for (let offset = 0; offset < binary.length; offset += dim * 4) {
    const row = new Float32Array(dim);
    for (let i = 0; i < dim; i++) row[i] = view.getFloat32(offset + i * 4, true);
    rows.push(row);
  }
  return rows;
}

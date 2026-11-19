import type { EmbeddingFailure } from './protocol';

/*
 * Pure helpers for the embedding worker (unit-tested; the worker only wires them up).
 */

/**
 * Batches of text indices, shortest texts first. A batch is padded to its longest text,
 * so grouping similar lengths avoids paying for 512 tokens on a 10-token line.
 */
export function batchOrder(texts: readonly string[], batchSize: number): number[][] {
  const size = Math.max(1, Math.floor(batchSize));
  const order = texts
    .map((text, index) => ({ index, length: text.length }))
    .sort((a, b) => a.length - b.length)
    .map(({ index }) => index);
  const batches: number[][] = [];
  for (let start = 0; start < order.length; start += size) {
    batches.push(order.slice(start, start + size));
  }
  return batches;
}

/** The texts of one batch, in batch order. */
export function pick(texts: readonly string[], batch: readonly number[]): string[] {
  return batch.map((index) => {
    const text = texts[index];
    if (text === undefined) throw new Error(`No text at index ${index}`);
    return text;
  });
}

/**
 * BGE's sentence embedding: the [CLS] token's hidden state (position 0), L2-normalised,
 * as the model card specifies and fastembed does on the server. `hidden` is the model's
 * last_hidden_state, row-major [batch, sequence, dim].
 */
export function clsVectors(hidden: Float32Array, dims: readonly number[]): Float32Array {
  const [batch = 0, sequence = 0, dim = 0] = dims;
  if (dims.length !== 3 || hidden.length !== batch * sequence * dim) {
    throw new Error(`Unexpected hidden state shape [${dims.join(', ')}]`);
  }
  const out = new Float32Array(batch * dim);
  for (let row = 0; row < batch; row++) {
    const cls = hidden.subarray(row * sequence * dim, row * sequence * dim + dim);
    let norm = 0;
    for (const value of cls) norm += value * value;
    norm = Math.sqrt(norm) || 1; // an all-zero vector stays zero
    for (let i = 0; i < dim; i++) out[row * dim + i] = (cls[i] ?? 0) / norm;
  }
  return out;
}

/** Writes one batch's rows (row-major, `dim` wide) back to their original positions. */
export function placeRows(
  out: Float32Array,
  batch: readonly number[],
  rows: Float32Array,
  dim: number,
): void {
  if (rows.length !== batch.length * dim) {
    throw new Error(`Expected ${batch.length * dim} values, got ${rows.length}`);
  }
  batch.forEach((index, row) => out.set(rows.subarray(row * dim, (row + 1) * dim), index * dim));
}

/** Byte totals across every model file, from Transformers.js progress events. */
export class DownloadTracker {
  private readonly files = new Map<string, { loaded: number; total: number }>();

  /** Returns the new totals, or null when the event carries no byte counts. */
  update(event: { status: string; file?: string; loaded?: number; total?: number }) {
    if (event.status !== 'progress' || !event.file || !event.total) return null;
    this.files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
    let loaded = 0;
    let total = 0;
    for (const file of this.files.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    return { loaded, total };
  }
}

/** Maps whatever the runtime threw to a reason the page can explain. */
export function classifyError(error: unknown): { reason: EmbeddingFailure; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  // WebAssembly.Memory growth and ONNX Runtime allocation failures.
  if (error instanceof RangeError || /out of memory|memory access|allocat/i.test(message)) {
    return { reason: 'out-of-memory', message };
  }
  if (
    /failed to fetch|networkerror|load failed|could not locate file|status 4\d\d/i.test(message)
  ) {
    return { reason: 'download-failed', message };
  }
  return { reason: 'failed', message };
}

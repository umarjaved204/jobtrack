import { type EmbeddingClient, EmbeddingError } from '@/features/match/embedding/embedding-client';
import type { EmbeddingFailure, ModelSpec } from '@/features/match/embedding/protocol';

/*
 * An `EmbeddingClient` without a worker or a model, for jsdom tests. Each text becomes a
 * unit vector (deterministic, like the real model: same text, same vector). Loading
 * reports one download step; `failOn` makes a step reject the way the worker would.
 */
export class FakeEmbeddingClient implements EmbeddingClient {
  loads: ModelSpec[] = [];
  embedded: string[][] = [];
  disposed = false;
  failOn: { step: 'load' | 'embed'; reason: EmbeddingFailure } | null = null;
  /** Holds `embed` until `release()`: lets a test act mid-run. */
  hold = false;
  private releaseHeld: (() => void) | null = null;
  private readonly dim: number;

  constructor(dim = 384) {
    this.dim = dim;
  }

  load(model: ModelSpec, onDownload?: (loaded: number, total: number) => void) {
    this.loads.push(model);
    if (this.failOn?.step === 'load') {
      return Promise.reject(new EmbeddingError(this.failOn.reason, 'fake load failure'));
    }
    onDownload?.(17_000_000, 34_000_000);
    onDownload?.(34_000_000, 34_000_000);
    return Promise.resolve({ loadMs: 900, threads: 1, crossOriginIsolated: false });
  }

  async embed(
    texts: readonly string[],
    options: { onProgress?: (done: number, total: number) => void } = {},
  ) {
    this.embedded.push([...texts]);
    if (this.failOn?.step === 'embed') {
      throw new EmbeddingError(this.failOn.reason, 'fake embed failure');
    }
    if (this.hold) await new Promise<void>((resolve) => (this.releaseHeld = resolve));
    if (this.disposed) throw new EmbeddingError('failed', 'Embedding was cancelled.');
    options.onProgress?.(texts.length, texts.length);
    return texts.map((text) => unitVector(text, this.dim));
  }

  release() {
    this.releaseHeld?.();
  }

  dispose() {
    this.disposed = true;
    this.release();
  }
}

function unitVector(text: string, dim: number): Float32Array {
  const row = new Float32Array(dim);
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  row[hash % dim] = 1;
  return row;
}

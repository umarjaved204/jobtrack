import type {
  EmbeddingFailure,
  LoadInfo,
  ModelSpec,
  WorkerRequest,
  WorkerResponse,
} from './protocol';
import { checkSupport, UNSUPPORTED_REASONS } from './support';

/*
 * Promise API over the embedding worker. The worker (and with it Transformers.js and
 * the model) starts on the first `load`, never at import, so importing this module costs
 * nothing. Tests pass a fake `spawn`; the real worker is only exercised in a browser.
 */

export class EmbeddingError extends Error {
  readonly reason: EmbeddingFailure;

  constructor(reason: EmbeddingFailure, message: string) {
    super(message);
    this.reason = reason;
    this.name = 'EmbeddingError';
  }
}

export interface EmbedOptions {
  /** Texts per model call. Larger batches amortise overhead but pad to the longest text. */
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface EmbeddingClient {
  /** Downloads (or reads from cache) and starts the model; resolves when it's ready. */
  load(model: ModelSpec, onDownload?: (loaded: number, total: number) => void): Promise<LoadInfo>;
  /** One vector per text, in order. */
  embed(texts: readonly string[], options?: EmbedOptions): Promise<Float32Array[]>;
  /** Stops the worker; pending calls reject. */
  dispose(): void;
}

export const DEFAULT_BATCH_SIZE = 8;

function spawnWorker(): Worker {
  return new Worker(new URL('./embed-worker.ts', import.meta.url), {
    type: 'module',
    name: 'embedding',
  });
}

interface Pending {
  resolve: (rows: Float32Array[]) => void;
  reject: (error: EmbeddingError) => void;
  onProgress?: EmbedOptions['onProgress'];
}

export function createEmbeddingClient({
  spawn = spawnWorker,
  support = checkSupport,
}: {
  spawn?: () => Worker;
  support?: () => ReturnType<typeof checkSupport>;
} = {}): EmbeddingClient {
  let worker: Worker | null = null;
  let loading: {
    promise: Promise<LoadInfo>;
    resolve: (info: LoadInfo) => void;
    reject: (error: EmbeddingError) => void;
    onDownload?: (loaded: number, total: number) => void;
  } | null = null;
  let ready = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function failAll(error: EmbeddingError) {
    loading?.reject(error);
    loading = null;
    for (const call of pending.values()) call.reject(error);
    pending.clear();
  }

  function onMessage(event: MessageEvent<WorkerResponse>) {
    const message = event.data;
    switch (message.type) {
      case 'download':
        loading?.onDownload?.(message.loaded, message.total);
        break;
      case 'ready':
        ready = true;
        loading?.resolve(message.info);
        break;
      case 'embed-progress':
        pending.get(message.id)?.onProgress?.(message.done, message.total);
        break;
      case 'embedded': {
        const call = pending.get(message.id);
        pending.delete(message.id);
        const { vectors, dim } = message;
        const rows: Float32Array[] = [];
        for (let start = 0; start < vectors.length; start += dim) {
          rows.push(vectors.subarray(start, start + dim));
        }
        call?.resolve(rows);
        break;
      }
      case 'error': {
        const error = new EmbeddingError(message.reason, message.message);
        if (message.id === undefined) {
          loading?.reject(error);
          loading = null; // a later load() retries
        } else {
          pending.get(message.id)?.reject(error);
          pending.delete(message.id);
        }
        break;
      }
    }
  }

  function start(): Worker {
    if (worker) return worker;
    worker = spawn();
    worker.addEventListener('message', onMessage);
    // The worker script itself failed to load or crashed (CSP, a failed chunk, a trap).
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      failAll(new EmbeddingError('failed', event.message || 'The embedding worker stopped.'));
      worker?.terminate();
      worker = null;
      ready = false;
    });
    return worker;
  }

  function post(message: WorkerRequest) {
    start().postMessage(message);
  }

  return {
    load(model, onDownload) {
      if (loading) {
        loading.onDownload = onDownload ?? loading.onDownload;
        return loading.promise;
      }
      const unsupported = support();
      if (unsupported) {
        return Promise.reject(new EmbeddingError('unsupported', UNSUPPORTED_REASONS[unsupported]));
      }
      let resolve!: (info: LoadInfo) => void;
      let reject!: (error: EmbeddingError) => void;
      const promise = new Promise<LoadInfo>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      loading = { promise, resolve, reject, onDownload };
      post({ type: 'load', model });
      return promise;
    },

    embed(texts, { batchSize = DEFAULT_BATCH_SIZE, onProgress } = {}) {
      if (!ready) {
        return Promise.reject(new EmbeddingError('failed', 'The model isn’t loaded yet.'));
      }
      if (texts.length === 0) return Promise.resolve([]);
      const id = nextId++;
      return new Promise<Float32Array[]>((resolve, reject) => {
        pending.set(id, { resolve, reject, onProgress });
        post({ type: 'embed', id, texts: [...texts], batchSize });
      });
    },

    dispose() {
      failAll(new EmbeddingError('failed', 'Embedding was cancelled.'));
      worker?.terminate();
      worker = null;
      ready = false;
    },
  };
}

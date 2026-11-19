/*
 * Messages between the page and the embedding worker (`embed-worker.ts`). The server
 * names the model (`GET /match/config` and `POST /match/prepare` return it), so the
 * worker has no model constants of its own: a model change is a server change.
 */

/**
 * Where the worker fetches model files, relative to our origin (Transformers.js fills in
 * `{model}` and `{revision}`). scripts/fetch-model.mjs writes them to the same place
 * under public/; a test keeps the two in step.
 */
export const MODEL_PATH_TEMPLATE = 'models/{model}/{revision}/';

export interface ModelSpec {
  /** Hugging Face repository, e.g. "Xenova/bge-small-en-v1.5". */
  id: string;
  /** A commit hash, never a branch: the files at a commit never change. */
  revision: string;
  /** Transformers.js dtype; "q8" loads onnx/model_quantized.onnx. */
  dtype: 'q8';
  dim: number;
}

/** Why embedding couldn't run, worded for the user by `failureMessage`. */
export type EmbeddingFailure =
  | 'unsupported' // no Web Workers, WebAssembly or WASM SIMD
  | 'download-failed' // the model files couldn't be fetched
  | 'out-of-memory'
  | 'failed'; // anything else (the message says what)

export type WorkerRequest =
  | { type: 'load'; model: ModelSpec }
  | { type: 'embed'; id: number; texts: string[]; batchSize: number };

export interface LoadInfo {
  loadMs: number;
  /** ONNX Runtime threads: more than 1 only when the page is cross-origin isolated. */
  threads: number;
  crossOriginIsolated: boolean;
}

export type WorkerResponse =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'ready'; info: LoadInfo }
  | { type: 'embed-progress'; id: number; done: number; total: number }
  /** Row-major (texts.length x dim), in the order the texts were sent. */
  | { type: 'embedded'; id: number; vectors: Float32Array; dim: number }
  | { type: 'error'; id?: number; reason: EmbeddingFailure; message: string };

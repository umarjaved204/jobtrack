/*
 * Embedding worker: runs Transformers.js off the main thread (ADR 0004).
 *
 * - The library is imported only here, and this file only loads when the match page
 *   starts a worker, so none of it is in the main bundle.
 * - Model files come from the Hugging Face CDN at a pinned commit and are cached by
 *   Transformers.js in the Cache API ("transformers-cache"), so a returning visit doesn't
 *   download again.
 * - ONNX Runtime's WebAssembly comes from our own origin (bundled by Vite, version locked
 *   by the lockfile), not jsdelivr: one third party fewer, and it works under a strict
 *   `connect-src 'self' huggingface.co` CSP. We use the plain SIMD build (14 MB): the
 *   default "asyncify" build (27 MB) exists for WebGPU, which we don't use.
 * - Threads: ONNX Runtime uses several only when the page is cross-origin isolated
 *   (SharedArrayBuffer); otherwise one. `LoadInfo.threads` reports which.
 */
import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

import { batchOrder, classifyError, DownloadTracker, pick, placeRows } from './embed-batches';
import type { ModelSpec, WorkerRequest, WorkerResponse } from './protocol';

env.allowLocalModels = false; // never probe our own origin for /models/...
env.useBrowserCache = true;
const onnx = env.backends.onnx;
if (onnx.wasm) {
  onnx.wasm.wasmPaths = {
    mjs: new URL(ortMjsUrl, self.location.href).href,
    wasm: new URL(ortWasmUrl, self.location.href).href,
  };
}

let extractor: Promise<FeatureExtractionPipeline> | null = null;
let loadedModel: ModelSpec | null = null;

function send(message: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

async function load(model: ModelSpec): Promise<FeatureExtractionPipeline> {
  if (extractor && loadedModel?.id === model.id && loadedModel.revision === model.revision) {
    return extractor;
  }
  loadedModel = model;
  const tracker = new DownloadTracker();
  const started = performance.now();
  extractor = pipeline('feature-extraction', model.id, {
    revision: model.revision,
    dtype: model.dtype,
    device: 'wasm',
    progress_callback: (event: ProgressInfo) => {
      const totals = tracker.update(event);
      if (totals) send({ type: 'download', ...totals });
    },
  });
  try {
    const ready = await extractor;
    send({
      type: 'ready',
      info: {
        loadMs: performance.now() - started,
        threads: Number(onnx.wasm?.numThreads ?? 1),
        crossOriginIsolated: self.crossOriginIsolated,
      },
    });
    return ready;
  } catch (error) {
    extractor = null; // let a retry start over
    loadedModel = null;
    throw error;
  }
}

async function embed(id: number, texts: string[], batchSize: number) {
  if (!extractor || !loadedModel) throw new Error('Embed requested before load');
  const run = await extractor;
  const dim = loadedModel.dim;
  const out = new Float32Array(texts.length * dim);
  let done = 0;
  for (const batch of batchOrder(texts, batchSize)) {
    // BGE uses the [CLS] vector, normalised (as fastembed does on the server).
    const output = await run(pick(texts, batch), { pooling: 'cls', normalize: true });
    placeRows(out, batch, output.data as Float32Array, dim);
    done += batch.length;
    send({ type: 'embed-progress', id, done, total: texts.length });
  }
  send({ type: 'embedded', id, vectors: out, dim }, [out.buffer]);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const work =
    request.type === 'load'
      ? load(request.model)
      : embed(request.id, request.texts, request.batchSize);
  work.catch((error: unknown) => {
    send({
      type: 'error',
      id: request.type === 'embed' ? request.id : undefined,
      ...classifyError(error),
    });
  });
};

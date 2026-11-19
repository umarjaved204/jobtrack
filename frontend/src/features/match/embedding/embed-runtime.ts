/*
 * The embedding runtime: Transformers.js, the model and the embed loop (ADR 0004).
 * The app runs it in a Web Worker (`embed-worker.ts`), never on the main thread. The
 * benchmark page can also run it on the main thread (`?thread=main`), because Chrome
 * DevTools' CPU throttling doesn't reach workers.
 *
 * - Importing this module pulls in Transformers.js; only the worker and the dev-only
 *   bench import it, so none of it is in the main bundle.
 * - Everything comes from our own origin; the browser never contacts a third party:
 *   - Model files: /models/<id>/<revision>/, put there at build time by
 *     scripts/fetch-model.mjs (pinned commit, hash-checked). Hugging Face's CDN was too
 *     slow to rely on (9-87 KB/s measured; ADR 0004). Transformers.js caches them in the
 *     Cache API ("transformers-cache"), so a returning visit doesn't download.
 *   - ONNX Runtime's WebAssembly: bundled by Vite (version locked by the lockfile), not
 *     jsdelivr. The plain SIMD build (14 MB, 2.4 MB brotli); the default "asyncify" build
 *     (27 MB) exists for WebGPU, which we don't use.
 *   So a CSP can stay at `connect-src 'self'`.
 * - No pipeline(): in Transformers.js 4.3.2, pipeline() reads config.json from `main` for
 *   its file list, ignoring `revision` (so it isn't fully pinned, and fails against our
 *   origin, which only has the pinned commit). AutoTokenizer has the same flaw (it checks
 *   tokenizer_config.json at `main`), so we fetch the two tokenizer files from the pinned
 *   path ourselves. AutoModel honours `revision`; [CLS] pooling is `clsVectors`.
 * - Threads: `wasmThreads` (threads.ts): one per logical CPU up to 4 on a cross-origin
 *   isolated page (the app sends COOP/COEP), otherwise one. Set before the first session
 *   is created; `LoadInfo.threads` reports what ONNX Runtime ended up with.
 */
import {
  AutoModel,
  BertTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type ProgressInfo,
  type Tensor,
} from '@huggingface/transformers';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

import {
  batchOrder,
  classifyError,
  clsVectors,
  DownloadTracker,
  pick,
  placeRows,
} from './embed-batches';
import {
  MODEL_PATH_TEMPLATE,
  type ModelSpec,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';
import { wasmThreads } from './threads';

export type Send = (message: WorkerResponse, transfer?: Transferable[]) => void;

// "Remote" in Transformers.js terms, but the remote is us. The revision stays in the path
// so a model change is a new URL (and a new cache entry), never a stale one.
env.allowLocalModels = false;
env.remoteHost = `${self.location.origin}/`;
env.remotePathTemplate = MODEL_PATH_TEMPLATE;
env.useBrowserCache = true;
const onnx = env.backends.onnx;
if (onnx.wasm) {
  onnx.wasm.wasmPaths = {
    mjs: new URL(ortMjsUrl, self.location.href).href,
    wasm: new URL(ortWasmUrl, self.location.href).href,
  };
}

interface Loaded {
  spec: ModelSpec;
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
}

let loading: Promise<Loaded> | null = null;
let loadingSpec: ModelSpec | null = null;

async function loadModel(spec: ModelSpec, send: Send): Promise<Loaded> {
  const tracker = new DownloadTracker();
  const options = {
    revision: spec.revision,
    progress_callback: (event: ProgressInfo) => {
      const totals = tracker.update(event);
      if (totals) send({ type: 'download', ...totals });
    },
  };
  const [tokenizer, model] = await Promise.all([
    loadTokenizer(spec),
    AutoModel.from_pretrained(spec.id, { ...options, dtype: spec.dtype, device: 'wasm' }),
  ]);
  return { spec, tokenizer, model };
}

async function loadTokenizer(spec: ModelSpec): Promise<PreTrainedTokenizer> {
  const base = new URL(
    MODEL_PATH_TEMPLATE.replace('{model}', spec.id).replace('{revision}', spec.revision),
    `${self.location.origin}/`,
  );
  const [json, config] = await Promise.all(
    ['tokenizer.json', 'tokenizer_config.json'].map(async (file) => {
      const response = await fetch(new URL(file, base));
      if (!response.ok)
        throw new Error(`Could not locate file: ${file} (status ${response.status})`);
      return (await response.json()) as unknown;
    }),
  );
  return new BertTokenizer(json, config);
}

async function load(spec: ModelSpec, send: Send, threads?: number): Promise<Loaded> {
  if (loading && loadingSpec?.id === spec.id && loadingSpec.revision === spec.revision) {
    return loading;
  }
  const started = performance.now();
  if (onnx.wasm) {
    onnx.wasm.numThreads = wasmThreads(
      self.crossOriginIsolated,
      self.navigator.hardwareConcurrency,
      threads,
    );
  }
  loadingSpec = spec;
  loading = loadModel(spec, send);
  try {
    const loaded = await loading;
    send({
      type: 'ready',
      info: {
        loadMs: performance.now() - started,
        threads: Number(onnx.wasm?.numThreads ?? 1),
        crossOriginIsolated: self.crossOriginIsolated,
      },
    });
    return loaded;
  } catch (error) {
    loading = null; // let a retry start over
    loadingSpec = null;
    throw error;
  }
}

async function embed(id: number, texts: string[], batchSize: number, send: Send) {
  if (!loading) throw new Error('Embed requested before load');
  const { spec, tokenizer, model } = await loading;
  const out = new Float32Array(texts.length * spec.dim);
  let done = 0;
  for (const batch of batchOrder(texts, batchSize)) {
    // No truncation: the server chunks every text to fit (and re-checks on POST /match),
    // so an over-long input is a bug to surface, not text to drop silently.
    const inputs = tokenizer(pick(texts, batch), { padding: true, truncation: false });
    const { last_hidden_state: hidden } = (await model(inputs)) as { last_hidden_state: Tensor };
    placeRows(out, batch, clsVectors(hidden.data as Float32Array, hidden.dims), spec.dim);
    done += batch.length;
    send({ type: 'embed-progress', id, done, total: texts.length });
  }
  send({ type: 'embedded', id, vectors: out, dim: spec.dim }, [out.buffer]);
}

/** Runs one request, reporting results and failures through `send`. */
export function handleRequest(request: WorkerRequest, send: Send): void {
  const work =
    request.type === 'load'
      ? load(request.model, send, request.threads)
      : embed(request.id, request.texts, request.batchSize, send);
  work.catch((error: unknown) => {
    send({
      type: 'error',
      id: request.type === 'embed' ? request.id : undefined,
      ...classifyError(error),
    });
  });
}

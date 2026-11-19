/*
 * Embedding worker: runs Transformers.js off the main thread (ADR 0004).
 *
 * - The library is imported only here, and this file only loads when the match page
 *   starts a worker, so none of it is in the main bundle.
 * - Everything comes from our own origin; the browser never contacts a third party:
 *   - Model files: /models/<id>/<revision>/, put there at build time by
 *     scripts/fetch-model.mjs (pinned commit, hash-checked). Hugging Face's CDN was too
 *     slow to rely on (9-87 KB/s measured; ADR 0004 Revision 2). Transformers.js caches
 *     them in the Cache API ("transformers-cache"), so a returning visit doesn't download.
 *   - ONNX Runtime's WebAssembly: bundled by Vite (version locked by the lockfile), not
 *     jsdelivr. The plain SIMD build (14 MB, 2.4 MB brotli); the default "asyncify" build
 *     (27 MB) exists for WebGPU, which we don't use.
 *   So a CSP can stay at `connect-src 'self'`.
 * - No pipeline(): in Transformers.js 4.3.2, pipeline() reads config.json from `main` for
 *   its file list, ignoring `revision` (so it isn't fully pinned, and fails against our
 *   origin, which only has the pinned commit). AutoTokenizer has the same flaw (it checks
 *   tokenizer_config.json at `main`), so we fetch the two tokenizer files from the pinned
 *   path ourselves. AutoModel honours `revision`; [CLS] pooling is `clsVectors`.
 * - Threads: ONNX Runtime uses several only when the page is cross-origin isolated
 *   (SharedArrayBuffer); otherwise one. `LoadInfo.threads` reports which.
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

function send(message: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

async function loadModel(spec: ModelSpec): Promise<Loaded> {
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

async function load(spec: ModelSpec): Promise<Loaded> {
  if (loading && loadingSpec?.id === spec.id && loadingSpec.revision === spec.revision) {
    return loading;
  }
  const started = performance.now();
  loadingSpec = spec;
  loading = loadModel(spec);
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

async function embed(id: number, texts: string[], batchSize: number) {
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

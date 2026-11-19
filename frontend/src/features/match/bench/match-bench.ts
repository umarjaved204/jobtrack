/*
 * Browser half of the match benchmark (docs/adr/0004 "Validation"). Dev-only: loaded by
 * bench/match.html, never by the app.
 *
 * 1. `cd backend && uv run python -m scripts.bench_match export` writes the server's real
 *    chunks for both cases to frontend/bench/data/chunks.json.
 * 2. `pnpm dev`, open http://localhost:5173/bench/match.html, Run.
 * 3. "Save results and vectors", then `uv run python -m scripts.bench_match browser FILE`
 *    validates the vectors as the server will and compares them with fastembed.
 *
 * Query params: `?batch=8` (texts per model call); `?thread=main` runs the model on the
 * main thread instead of the worker, so DevTools CPU throttling applies (it doesn't reach
 * workers). The app always uses the worker.
 */
import { createEmbeddingClient, DEFAULT_BATCH_SIZE } from '../embedding/embedding-client';
import type { LoadInfo, ModelSpec } from '../embedding/protocol';
import { checkSupport } from '../embedding/support';

interface BenchCase {
  name: string;
  label: string;
  jd_chunks: string[];
  resume_chunks: string[];
}

interface ChunksFile {
  model: ModelSpec;
  cases: BenchCase[];
}

const CACHE_NAME = 'transformers-cache'; // Transformers.js `env.cacheKey` default

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLParagraphElement>('status');
const progress = $<HTMLProgressElement>('progress');
const results = $<HTMLTableSectionElement>('results');
const raw = $<HTMLPreElement>('raw');
const runButton = $<HTMLButtonElement>('run');
const saveButton = $<HTMLButtonElement>('save');

const params = new URLSearchParams(location.search);
const batchSize = Number(params.get('batch')) || DEFAULT_BATCH_SIZE;
const thread = params.get('thread') === 'main' ? 'main' : 'worker';
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

function row(measure: string, result: string) {
  const tr = results.insertRow();
  tr.insertCell().textContent = measure;
  tr.insertCell().textContent = result;
}

function setProgress(label: string, done: number, total: number) {
  status.textContent = label;
  progress.max = Math.max(total, 1);
  progress.value = done;
}

$<HTMLParagraphElement>('env').textContent = [
  navigator.userAgent,
  `${navigator.hardwareConcurrency} logical CPUs`,
  `cross-origin isolated: ${String(self.crossOriginIsolated)}`,
  `batch size ${batchSize}`,
  `runs on: ${thread} thread`,
  `support: ${checkSupport() ?? 'ok'}`,
].join(' · ');

$<HTMLButtonElement>('clear').addEventListener('click', () => {
  void caches.delete(CACHE_NAME).then((deleted) => {
    status.textContent = deleted ? 'Model cache cleared. Reload, then Run.' : 'No model cache.';
  });
});

let report: Record<string, unknown> | null = null;

saveButton.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `browser-vectors-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

async function run(file: ChunksFile) {
  runButton.disabled = true;
  results.replaceChildren();
  // Imported only in main-thread mode, so worker runs don't load Transformers.js here.
  const spawn =
    thread === 'main'
      ? await import('./main-thread-worker').then(
          ({ MainThreadWorker }) =>
            () =>
              new MainThreadWorker() as unknown as Worker,
        )
      : undefined;
  const client = createEmbeddingClient({ spawn });
  const cached = (await caches.keys()).includes(CACHE_NAME);
  let downloaded = 0;

  const started = performance.now();
  const info: LoadInfo = await client.load(file.model, (loaded, total) => {
    downloaded = total;
    setProgress(
      `Downloading model: ${(loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`,
      loaded,
      total,
    );
  });
  const loadWallMs = performance.now() - started;
  row(
    cached ? 'Model load (from browser cache)' : 'First run: download + load',
    `${seconds(loadWallMs)} (${(downloaded / 1e6).toFixed(1)} MB reported)`,
  );
  row('ONNX Runtime threads', String(info.threads));

  const cases: Record<string, unknown>[] = [];
  for (const benchCase of file.cases) {
    const timings: number[] = [];
    let vectors: { jd: number[][]; resume: number[][] } | null = null;
    for (const pass of [1, 2]) {
      const t0 = performance.now();
      const embedAll = async (texts: string[], what: string) =>
        client.embed(texts, {
          batchSize,
          onProgress: (done, total) =>
            setProgress(`${benchCase.label}, pass ${pass}: ${what} ${done}/${total}`, done, total),
        });
      const resume = await embedAll(benchCase.resume_chunks, 'resume chunks');
      const jd = await embedAll(benchCase.jd_chunks, 'JD chunks');
      timings.push(performance.now() - t0);
      vectors ??= { jd: jd.map((v) => Array.from(v)), resume: resume.map((v) => Array.from(v)) };
    }
    const chunks = `${benchCase.jd_chunks.length} JD + ${benchCase.resume_chunks.length} resume chunks`;
    row(`${benchCase.label}: first embed (${chunks})`, seconds(timings[0] ?? 0));
    row(`${benchCase.label}: again`, seconds(timings[1] ?? 0));
    cases.push({ name: benchCase.name, embed_ms: timings, ...vectors });
  }
  client.dispose();

  report = {
    model: file.model,
    environment: {
      user_agent: navigator.userAgent,
      cpus: navigator.hardwareConcurrency,
      cross_origin_isolated: self.crossOriginIsolated,
      threads: info.threads,
      batch_size: batchSize,
      thread,
    },
    load: { wall_ms: loadWallMs, worker_ms: info.loadMs, from_cache: cached, bytes: downloaded },
    cases,
  };
  raw.textContent = JSON.stringify(
    { ...report, cases: cases.map(({ name, embed_ms }) => ({ name, embed_ms })) },
    null,
    2,
  );
  // For automation (DevTools protocol): the same JSON as "Save results and vectors".
  Object.assign(window, { benchReport: report });
  status.textContent = 'Done.';
  saveButton.disabled = false;
  runButton.disabled = false;
}

fetch('/bench/data/chunks.json')
  .then(async (response) => {
    if (!response.ok) throw new Error(`chunks.json: HTTP ${response.status}`);
    const file = (await response.json()) as ChunksFile;
    status.textContent = `Ready: ${file.cases.length} cases, model ${file.model.id}@${file.model.revision.slice(0, 7)}.`;
    runButton.disabled = false;
    runButton.addEventListener('click', () => {
      run(file).catch((error: unknown) => {
        status.textContent = `Failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
        runButton.disabled = false;
      });
    });
  })
  .catch((error: unknown) => {
    status.textContent = `${String(error)}. Run \`uv run python -m scripts.bench_match export\` in backend/ first.`;
  });

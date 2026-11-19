import { MODEL_PATH_TEMPLATE, type ModelSpec } from './protocol';

/*
 * Is the model already in this browser? Then a match needs no download, and the page
 * doesn't ask first. Transformers.js (4.3.2) keeps fetched model files in the Cache API
 * under `transformers-cache`, keyed by the full URL it fetched. That is the library's
 * internal detail, so this fails safe: if the key ever changes, the page asks before a
 * download that turns out to be a cache hit, and nothing worse.
 */

export const CACHE_NAME = 'transformers-cache';
/** What `dtype: 'q8'` loads: the bulk of the download. */
export const WEIGHTS_FILE = 'onnx/model_quantized.onnx';
/**
 * The first run's download, rounded up: the model files in scripts/model-manifest.json
 * (a test keeps this in step). The WebAssembly runtime comes with the app's own assets.
 */
export const MODEL_DOWNLOAD_MB = 35;

export function weightsUrl(model: ModelSpec, origin = globalThis.location.origin): string {
  const path = MODEL_PATH_TEMPLATE.replace('{model}', model.id).replace(
    '{revision}',
    encodeURIComponent(model.revision),
  );
  return new URL(`${path}${WEIGHTS_FILE}`, `${origin}/`).href;
}

export async function isModelCached(
  model: ModelSpec,
  storage: CacheStorage | undefined = globalThis.caches,
): Promise<boolean> {
  try {
    if (!storage || !(await storage.has(CACHE_NAME))) return false;
    const cache = await storage.open(CACHE_NAME);
    return (await cache.match(weightsUrl(model))) !== undefined;
  } catch {
    return false; // storage blocked (private mode, permissions): assume a download
  }
}

import { describe, expect, it } from 'vitest';

import manifestJson from '../../../../scripts/model-manifest.json?raw';
import { isModelCached, MODEL_DOWNLOAD_MB, weightsUrl } from './model-cache';
import type { ModelSpec } from './protocol';

const MODEL: ModelSpec = {
  id: 'Xenova/bge-small-en-v1.5',
  revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
  dtype: 'q8',
  dim: 384,
};

/** A Cache API holding the given URLs in `transformers-cache`. */
function cacheStorage(urls: string[], { name = 'transformers-cache' } = {}): CacheStorage {
  const cache = { match: (url: string) => Promise.resolve(urls.includes(url) ? new Response() : undefined) }; // prettier-ignore
  return {
    has: (wanted: string) => Promise.resolve(wanted === name),
    open: () => Promise.resolve(cache),
  } as unknown as CacheStorage;
}

describe('model cache', () => {
  it('finds the weights under the URL Transformers.js fetched', () => {
    expect(weightsUrl(MODEL, 'https://jobtrack.example')).toBe(
      'https://jobtrack.example/models/Xenova/bge-small-en-v1.5/ea104dacec62c0de699686887e3f920caeb4f3e3/onnx/model_quantized.onnx',
    );
  });

  it('is cached only when the weights are in transformers-cache', async () => {
    expect(await isModelCached(MODEL, cacheStorage([weightsUrl(MODEL)]))).toBe(true);
    expect(await isModelCached(MODEL, cacheStorage([]))).toBe(false);
    expect(await isModelCached(MODEL, cacheStorage([weightsUrl(MODEL)], { name: 'other' }))).toBe(
      false,
    );
    const otherRevision = { ...MODEL, revision: '0'.repeat(40) };
    expect(await isModelCached(otherRevision, cacheStorage([weightsUrl(MODEL)]))).toBe(false);
  });

  it('assumes a download when the Cache API is missing or blocked', async () => {
    expect(await isModelCached(MODEL, undefined)).toBe(false);
    const blocked = { has: () => Promise.reject(new DOMException('denied', 'SecurityError')) };
    expect(await isModelCached(MODEL, blocked as unknown as CacheStorage)).toBe(false);
  });

  it('states the download size the manifest adds up to', () => {
    const manifest = JSON.parse(manifestJson) as { files: { size: number }[] };
    const bytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
    expect(MODEL_DOWNLOAD_MB).toBe(Math.ceil(bytes / 1e6));
  });
});

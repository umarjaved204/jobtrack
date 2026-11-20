import { describe, expect, it } from 'vitest';

import fetchScript from '../../../../scripts/fetch-model.mjs?raw';
import manifestJson from '../../../../scripts/model-manifest.json?raw';
import vercelJson from '../../../../vercel.json?raw';
import { MODEL_PATH_TEMPLATE } from './protocol';

/*
 * The model is served from our own origin (ADR 0004 Revision 1): the fetch script writes
 * public/models/<id>/<revision>/, the worker asks for /models/{model}/{revision}/, and
 * Vercel must serve those files as files (never the SPA's index.html).
 */
interface Manifest {
  id: string;
  revision: string;
  files: { path: string; size: number; sha256?: string; gitBlob?: string }[];
}

const manifest = JSON.parse(manifestJson) as Manifest;

describe('model hosting', () => {
  it('pins a commit, and every file has a size and a hash', () => {
    expect(manifest.revision).toMatch(/^[0-9a-f]{40}$/);
    for (const file of manifest.files) {
      expect(file.size).toBeGreaterThan(0);
      expect(file.sha256 ?? file.gitBlob).toMatch(/^[0-9a-f]{40,64}$/);
    }
  });

  it('includes the q8 weights the worker loads', () => {
    expect(manifest.files.map((file) => file.path)).toContain('onnx/model_quantized.onnx');
  });

  it('the worker asks for files where the fetch script puts them', () => {
    const url = MODEL_PATH_TEMPLATE.replace('{model}', manifest.id).replace(
      '{revision}',
      manifest.revision,
    );
    expect(url).toBe(`models/${manifest.id}/${manifest.revision}/`);
    expect(fetchScript).toContain("join(ROOT, 'public', 'models', manifest.id, manifest.revision)");
  });

  it('Vercel never rewrites a missing model file to index.html', () => {
    const config = JSON.parse(vercelJson) as { rewrites: { source: string }[] };
    const spa = new RegExp(`^${config.rewrites[0]?.source ?? ''}$`);
    expect(spa.test('/applications/123')).toBe(true);
    expect(spa.test(`/models/${manifest.id}/${manifest.revision}/config.json`)).toBe(false);
    expect(spa.test('/api/v1/health')).toBe(false);
  });
});

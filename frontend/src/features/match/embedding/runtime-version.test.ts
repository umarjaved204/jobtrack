import { expect, it } from 'vitest';

import transformersJson from '../../../../node_modules/@huggingface/transformers/package.json?raw';
import appJson from '../../../../package.json?raw';

/*
 * The worker serves ONNX Runtime's WebAssembly from our own origin, imported from our
 * direct `onnxruntime-web` dependency. The JavaScript half comes from the copy
 * Transformers.js depends on. The two must be the same build, or the runtime and its
 * .wasm disagree at load time. Bumping @huggingface/transformers means re-pinning this.
 */
interface PackageJson {
  version: string;
  dependencies: Record<string, string>;
}

it('our onnxruntime-web is the exact version Transformers.js uses', () => {
  const app = JSON.parse(appJson) as PackageJson;
  const transformers = JSON.parse(transformersJson) as PackageJson;

  expect(app.dependencies['onnxruntime-web']).toBe(transformers.dependencies['onnxruntime-web']);
  expect(app.dependencies['@huggingface/transformers']).toBe(transformers.version);
});

import { describe, expect, it, vi } from 'vitest';

import { createEmbeddingClient, EmbeddingError } from './embedding-client';
import type { ModelSpec, WorkerRequest, WorkerResponse } from './protocol';

const MODEL: ModelSpec = {
  id: 'Xenova/bge-small-en-v1.5',
  revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
  dtype: 'q8',
  dim: 2,
};

/** A stand-in for the worker: records requests, replies when the test says so. */
class FakeWorker extends EventTarget {
  readonly requests: WorkerRequest[] = [];
  terminated = false;

  postMessage(request: WorkerRequest) {
    this.requests.push(request);
  }

  reply(message: WorkerResponse) {
    this.dispatchEvent(new MessageEvent('message', { data: message }));
  }

  crash(message: string) {
    this.dispatchEvent(new ErrorEvent('error', { message, cancelable: true }));
  }

  terminate() {
    this.terminated = true;
  }
}

function setup() {
  const worker = new FakeWorker();
  const spawn = vi.fn(() => worker as unknown as Worker);
  const client = createEmbeddingClient({ spawn, support: () => null });
  return { worker, spawn, client };
}

async function loaded() {
  const context = setup();
  const load = context.client.load(MODEL);
  context.worker.reply({
    type: 'ready',
    info: { loadMs: 1200, threads: 1, crossOriginIsolated: false },
  });
  await load;
  return context;
}

describe('createEmbeddingClient', () => {
  it('starts the worker only on the first load', async () => {
    const { spawn, client, worker } = setup();
    expect(spawn).not.toHaveBeenCalled();

    const download = vi.fn();
    const load = client.load(MODEL, download);
    worker.reply({ type: 'download', loaded: 10, total: 40 });
    worker.reply({ type: 'ready', info: { loadMs: 5, threads: 4, crossOriginIsolated: true } });

    await expect(load).resolves.toEqual({ loadMs: 5, threads: 4, crossOriginIsolated: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(worker.requests).toEqual([{ type: 'load', model: MODEL }]);
    expect(download).toHaveBeenCalledWith(10, 40);
  });

  it('shares one load between callers', async () => {
    const { client, worker } = setup();
    const first = client.load(MODEL);
    const second = client.load(MODEL);
    expect(worker.requests).toHaveLength(1);
    worker.reply({ type: 'ready', info: { loadMs: 1, threads: 1, crossOriginIsolated: false } });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('explains an unsupported browser without starting a worker', async () => {
    const spawn = vi.fn();
    const client = createEmbeddingClient({ spawn, support: () => 'no-simd' });

    const error = await client.load(MODEL).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmbeddingError);
    expect(error).toMatchObject({ reason: 'unsupported', message: expect.stringMatching(/SIMD/) });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects a failed load and lets the next load retry', async () => {
    const { client, worker } = setup();
    const load = client.load(MODEL);
    worker.reply({ type: 'error', reason: 'download-failed', message: 'Failed to fetch' });
    await expect(load).rejects.toMatchObject({ reason: 'download-failed' });

    void client.load(MODEL);
    expect(worker.requests).toHaveLength(2);
  });

  it('returns one vector per text in the order sent', async () => {
    const { client, worker } = await loaded();
    const progress = vi.fn();

    const result = client.embed(['a', 'b', 'c'], { batchSize: 2, onProgress: progress });
    const request = worker.requests.at(-1);
    expect(request).toEqual({ type: 'embed', id: 1, texts: ['a', 'b', 'c'], batchSize: 2 });
    worker.reply({ type: 'embed-progress', id: 1, done: 2, total: 3 });
    worker.reply({
      type: 'embedded',
      id: 1,
      dim: 2,
      vectors: new Float32Array([1, 0, 0, 1, 0.6, 0.8]),
    });

    const rows = await result;
    expect(rows.map((row) => Array.from(row))).toEqual([
      [1, 0],
      [0, 1],
      [expect.closeTo(0.6), expect.closeTo(0.8)],
    ]);
    expect(progress).toHaveBeenCalledWith(2, 3);
  });

  it('refuses to embed before the model is ready', async () => {
    const { client } = setup();
    await expect(client.embed(['a'])).rejects.toMatchObject({ reason: 'failed' });
  });

  it('routes an embed error to its own call', async () => {
    const { client, worker } = await loaded();
    const first = client.embed(['a']);
    const second = client.embed(['b']);
    worker.reply({ type: 'error', id: 1, reason: 'out-of-memory', message: 'RangeError' });
    worker.reply({ type: 'embedded', id: 2, dim: 2, vectors: new Float32Array([1, 0]) });

    await expect(first).rejects.toMatchObject({ reason: 'out-of-memory' });
    await expect(second).resolves.toHaveLength(1);
  });

  it('fails every pending call when the worker crashes', async () => {
    const { client, worker } = await loaded();
    const call = client.embed(['a']);
    worker.crash('Refused to load the script');

    await expect(call).rejects.toMatchObject({
      reason: 'failed',
      message: 'Refused to load the script',
    });
    expect(worker.terminated).toBe(true);
    await expect(client.embed(['a'])).rejects.toMatchObject({ reason: 'failed' });
  });

  it('dispose stops the worker and cancels pending calls', async () => {
    const { client, worker } = await loaded();
    const call = client.embed(['a']);
    client.dispose();
    await expect(call).rejects.toMatchObject({ message: 'Embedding was cancelled.' });
    expect(worker.terminated).toBe(true);
  });
});

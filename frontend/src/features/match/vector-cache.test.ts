import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import type { ModelSpec } from './embedding/protocol';
import {
  clearVectorCache,
  createChunkVectorCache,
  createIndexedDbStore,
  type VectorStore,
} from './vector-cache';

const MODEL: ModelSpec = { id: 'Xenova/bge-small-en-v1.5', revision: 'a'.repeat(40), dtype: 'q8', dim: 3 }; // prettier-ignore
const vec = (...values: number[]) => Float32Array.from(values);
/** Plain arrays (or undefined): fake-indexeddb returns another realm's Float32Arrays. */
const plain = (rows: readonly (Float32Array | undefined)[]) =>
  rows.map((row) => (row ? Array.from(row) : undefined));

/** A real IndexedDB (in memory), fresh for each test, with a controllable clock. */
function setup({ maxEntries = 100 } = {}) {
  let time = 1_000;
  const factory = new IDBFactory();
  const store = createIndexedDbStore({ factory, maxEntries, now: () => time });
  return {
    factory,
    store,
    tick: () => (time += 1),
    reopen: () => createIndexedDbStore({ factory, maxEntries, now: () => time }),
  };
}

describe('IndexedDB vector store', () => {
  it('returns stored vectors, undefined for misses, across connections', async () => {
    const { store, reopen } = setup();
    await store.putMany([{ key: 'a', vector: vec(1, 2, 3) }]);
    expect(plain(await store.getMany(['a', 'b']))).toEqual([[1, 2, 3], undefined]);
    expect(plain(await reopen().getMany(['a']))).toEqual([[1, 2, 3]]);
  });

  it('stores a copy, not the whole buffer a view points into', async () => {
    const { store } = setup();
    const shared = vec(1, 2, 3, 4, 5, 6);
    await store.putMany([{ key: 'second-row', vector: shared.subarray(3, 6) }]);
    const [stored] = await store.getMany(['second-row']);
    expect(plain([stored])).toEqual([[4, 5, 6]]);
    expect(stored?.buffer.byteLength).toBe(3 * 4);
  });

  it('evicts the least recently used beyond the cap; a hit counts as a use', async () => {
    const { store, tick } = setup({ maxEntries: 3 });
    await store.putMany([{ key: 'a', vector: vec(1, 0, 0) }]);
    tick();
    await store.putMany([{ key: 'b', vector: vec(0, 1, 0) }]);
    tick();
    await store.putMany([{ key: 'c', vector: vec(0, 0, 1) }]);
    tick();
    await store.getMany(['a']); // a is now the most recently used
    tick();
    await store.putMany([{ key: 'd', vector: vec(1, 1, 0) }]);

    const [a, b, c, d] = await store.getMany(['a', 'b', 'c', 'd']);
    expect(b).toBeUndefined(); // the oldest unused one went
    expect([a, c, d].every(Boolean)).toBe(true);
  });

  it('evicts several at once when a big batch arrives', async () => {
    const { store, tick } = setup({ maxEntries: 3 });
    await store.putMany([{ key: 'old1', vector: vec(1, 0, 0) }, { key: 'old2', vector: vec(0, 1, 0) }]); // prettier-ignore
    tick();
    await store.putMany(['n1', 'n2', 'n3'].map((key) => ({ key, vector: vec(0, 0, 1) })));
    const found = await store.getMany(['old1', 'old2', 'n1', 'n2', 'n3']);
    expect(found.map(Boolean)).toEqual([false, false, true, true, true]);
  });

  it('clears everything', async () => {
    const { store } = setup();
    await store.putMany([{ key: 'a', vector: vec(1, 2, 3) }]);
    await clearVectorCache(store);
    expect(await store.getMany(['a'])).toEqual([undefined]);
  });
});

describe('chunk vector cache', () => {
  it('keys by user, model and revision, so none of them share vectors', async () => {
    const { store } = setup();
    const sam = createChunkVectorCache({ userId: 'sam', store });
    const ayesha = createChunkVectorCache({ userId: 'ayesha', store });
    await sam.store(MODEL, ['React and TypeScript'], [vec(1, 0, 0)]);

    expect(await sam.lookup(MODEL, ['React and TypeScript', 'GraphQL'])).toEqual([vec(1, 0, 0), undefined]); // prettier-ignore
    // The cache hands back this realm's Float32Array, whatever the store returned.
    expect((await sam.lookup(MODEL, ['React and TypeScript']))[0]).toBeInstanceOf(Float32Array);
    expect(await ayesha.lookup(MODEL, ['React and TypeScript'])).toEqual([undefined]);
    const newRevision = { ...MODEL, revision: 'b'.repeat(40) };
    expect(await sam.lookup(newRevision, ['React and TypeScript'])).toEqual([undefined]);
  });

  it('treats a vector of the wrong width as a miss', async () => {
    const { store } = setup();
    const cache = createChunkVectorCache({ userId: 'sam', store });
    await cache.store(MODEL, ['line'], [vec(1, 0)]);
    expect(await cache.lookup(MODEL, ['line'])).toEqual([undefined]);
  });

  it('survives sign-out as a clear: nothing is found afterwards', async () => {
    const { store } = setup();
    const cache = createChunkVectorCache({ userId: 'sam', store });
    await cache.store(MODEL, ['line'], [vec(1, 0, 0)]);
    await clearVectorCache(store);
    expect(await cache.lookup(MODEL, ['line'])).toEqual([undefined]);
  });
});

describe('storage failures fall back to no caching', () => {
  const failing = (error: Error): VectorStore => ({
    getMany: () => Promise.reject(error),
    putMany: () => Promise.reject(error),
    clear: () => Promise.reject(error),
  });

  it('a full disk (quota) on store is swallowed', async () => {
    const quota = new DOMException('Quota exceeded', 'QuotaExceededError');
    const cache = createChunkVectorCache({ userId: 'sam', store: failing(quota) });
    await expect(cache.store(MODEL, ['line'], [vec(1, 0, 0)])).resolves.toBeUndefined();
    await expect(cache.lookup(MODEL, ['line'])).resolves.toEqual([undefined]);
  });

  it('private mode (no IndexedDB) means every lookup misses and clear is a no-op', async () => {
    const store = createIndexedDbStore({ factory: undefined });
    const cache = createChunkVectorCache({ userId: 'sam', store });
    expect(await cache.lookup(MODEL, ['a', 'b'])).toEqual([undefined, undefined]);
    await expect(cache.store(MODEL, ['a'], [vec(1, 0, 0)])).resolves.toBeUndefined();
    await expect(clearVectorCache(store)).resolves.toBeUndefined();
  });

  it('an open that fails is a miss, and the next call tries again', async () => {
    const factory = new IDBFactory();
    const open = vi.spyOn(factory, 'open').mockImplementationOnce(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const store = createIndexedDbStore({ factory });
    const cache = createChunkVectorCache({ userId: 'sam', store });
    expect(await cache.lookup(MODEL, ['a'])).toEqual([undefined]);

    await cache.store(MODEL, ['a'], [vec(1, 0, 0)]); // the second open succeeds
    expect(await cache.lookup(MODEL, ['a'])).toEqual([vec(1, 0, 0)]);
    expect(open).toHaveBeenCalledTimes(2); // then the connection is reused
  });

  it('a lookup that hangs (e.g. an open blocked by another tab) times out as a miss', async () => {
    const hanging: VectorStore = {
      getMany: () => new Promise(() => {}),
      putMany: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    const cache = createChunkVectorCache({ userId: 'sam', store: hanging, timeoutMs: 20 });
    expect(await cache.lookup(MODEL, ['a'])).toEqual([undefined]);
  });

  it('no crypto.subtle (an insecure context) means no caching', async () => {
    const { store } = setup();
    const noHash = () => Promise.reject(new TypeError('crypto.subtle is undefined'));
    const cache = createChunkVectorCache({ userId: 'sam', store, hash: noHash });
    await expect(cache.store(MODEL, ['a'], [vec(1, 0, 0)])).resolves.toBeUndefined();
    expect(await cache.lookup(MODEL, ['a'])).toEqual([undefined]);
  });

  it('clearVectorCache never throws, so sign-out always completes', async () => {
    await expect(clearVectorCache(failing(new Error('closed')))).resolves.toBeUndefined();
  });
});

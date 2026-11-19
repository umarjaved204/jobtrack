import type { ModelSpec } from './embedding/protocol';

/*
 * Chunk vectors kept in this browser, so a repeat match only embeds what's new: matching
 * one resume against several adverts re-embeds just the advert (ADR 0004 Revision 2).
 *
 * - Keys: user id + model id + revision + SHA-256 of the chunk text. A new model revision
 *   or another user never reads these vectors; an edited resume reuses its unchanged lines.
 * - LRU: at most MAX_ENTRIES vectors. Every entry is one vector of the model's width
 *   (1.5 KB at 384 dims), so the count is the byte cap (~6 MB). Hits refresh `lastUsed`;
 *   the least recently used go first.
 * - Never a failed match: any storage problem (private mode, quota, an open that fails or
 *   hangs, no crypto.subtle) means "not cached", and the match embeds everything.
 * - Cleared, for every user, on sign-out (`sign-out-handler.ts`).
 * - Only this device: the vectors are of the user's own texts, and the server re-checks
 *   whatever is sent (POST /match).
 */

export const DB_NAME = 'jobtrack-vectors';
const STORE = 'vectors';
const BY_LAST_USED = 'lastUsed';
export const MAX_ENTRIES = 4000;
/** A lookup slower than this (e.g. an open blocked by another tab) is treated as a miss. */
export const LOOKUP_TIMEOUT_MS = 2000;

interface Entry {
  key: string;
  vector: Float32Array;
  lastUsed: number;
}

/** The storage behind the cache. Swappable, so failures can be tested. */
export interface VectorStore {
  /** One result per key, `undefined` for a miss. Marks the hits as just used. */
  getMany(keys: readonly string[]): Promise<(Float32Array | undefined)[]>;
  /** Stores (as just used), then evicts the least recently used beyond the cap. */
  putMany(entries: readonly { key: string; vector: Float32Array }[]): Promise<void>;
  clear(): Promise<void>;
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

export function createIndexedDbStore({
  factory = globalThis.indexedDB as IDBFactory | undefined,
  maxEntries = MAX_ENTRIES,
  now = Date.now,
}: { factory?: IDBFactory; maxEntries?: number; now?: () => number } = {}): VectorStore {
  let db: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex(BY_LAST_USED, 'lastUsed');
      };
      request.onsuccess = () => {
        const connection = request.result;
        // Another tab deleting or upgrading the database: let it, and reopen next time.
        connection.onversionchange = () => {
          connection.close();
          db = null;
        };
        resolve(connection);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB open blocked'));
    }).catch((error: unknown) => {
      db = null; // a later call may succeed
      throw error;
    });
    return db;
  }

  return {
    async getMany(keys) {
      const tx = (await open()).transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const used = now();
      const entries = await Promise.all(keys.map((key) => done<Entry | undefined>(store.get(key))));
      for (const entry of entries) if (entry) store.put({ ...entry, lastUsed: used });
      await finished(tx);
      return entries.map((entry) => entry?.vector);
    },

    async putMany(entries) {
      if (entries.length === 0) return;
      const tx = (await open()).transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const used = now();
      // A copy: rows from the worker are views into one shared buffer, and structured
      // clone would store that whole buffer with every entry.
      for (const { key, vector } of entries) {
        store.put({ key, vector: new Float32Array(vector), lastUsed: used });
      }
      let excess = (await done(store.count())) - maxEntries;
      if (excess > 0) {
        const cursors = store.index(BY_LAST_USED).openCursor();
        await new Promise<void>((resolve, reject) => {
          cursors.onsuccess = () => {
            const cursor = cursors.result;
            if (!cursor || excess <= 0) return resolve();
            cursor.delete();
            excess -= 1;
            cursor.continue();
          };
          cursors.onerror = () => reject(cursors.error ?? new Error('IndexedDB cursor failed'));
        });
      }
      await finished(tx);
    },

    async clear() {
      if (!factory) return; // nothing could have been stored
      const tx = (await open()).transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await finished(tx);
    },
  };
}

// ---------------------------------------------------------------- the app's cache

let shared: VectorStore | null = null;
/** One store per page, opened on first use. */
export function sharedVectorStore(): VectorStore {
  shared ??= createIndexedDbStore();
  return shared;
}

/** Clears every user's vectors. Never throws (sign-out must always complete). */
export async function clearVectorCache(store: VectorStore = sharedVectorStore()): Promise<void> {
  try {
    await store.clear();
  } catch {
    // Storage unavailable: then nothing was cached either.
  }
}

export interface ChunkVectorCache {
  /** One vector per text, `undefined` where it has to be embedded. Never rejects. */
  lookup(model: ModelSpec, texts: readonly string[]): Promise<(Float32Array | undefined)[]>;
  /** Remembers freshly embedded vectors. Never rejects. */
  store(
    model: ModelSpec,
    texts: readonly string[],
    vectors: readonly Float32Array[],
  ): Promise<void>;
}

const isFloat32Array = (value: unknown): value is Float32Array =>
  Object.prototype.toString.call(value) === '[object Float32Array]';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vector cache timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function createChunkVectorCache({
  userId,
  store = sharedVectorStore(),
  timeoutMs = LOOKUP_TIMEOUT_MS,
  hash = sha256Hex,
}: {
  userId: string;
  store?: VectorStore;
  timeoutMs?: number;
  hash?: (text: string) => Promise<string>;
}): ChunkVectorCache {
  const keysFor = (model: ModelSpec, texts: readonly string[]) =>
    Promise.all(texts.map(async (text) => `${userId}|${model.id}@${model.revision}|${await hash(text)}`)); // prettier-ignore

  return {
    async lookup(model, texts) {
      try {
        const vectors = await withTimeout(
          keysFor(model, texts).then((keys) => store.getMany(keys)),
          timeoutMs,
        );
        // A vector of another width can't be this model's: embed it again. Checked by tag,
        // not `instanceof`: a store may hand back another realm's Float32Array, so the
        // caller gets a copy in its own.
        return vectors.map((v) => (isFloat32Array(v) && v.length === model.dim ? new Float32Array(v) : undefined)); // prettier-ignore
      } catch {
        return texts.map(() => undefined);
      }
    },

    async store(model, texts, vectors) {
      try {
        const keys = await keysFor(model, texts);
        await store.putMany(keys.map((key, i) => ({ key, vector: vectors[i] as Float32Array })));
      } catch {
        // Quota, private mode, a closed database: the match already has its vectors.
      }
    },
  };
}

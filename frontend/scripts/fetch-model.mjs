// Downloads the browser embedding model into public/models/<id>/<revision>/ so the app
// serves it from its own origin (docs/adr/0004 Revision 1). Runs before every build
// (`pnpm build`) and on demand (`pnpm fetch-model`).
//
// - Pinned: every file comes from the commit in model-manifest.json and is checked
//   against its hash; a mismatch deletes the file and fails.
// - Idempotent: verified files are skipped, so repeat builds don't download again.
// - Resumable and parallel: Hugging Face's CDN can be very slow from some networks (we
//   measured 9-87 KB/s per connection), so large files are fetched as SEGMENTS byte
//   ranges at once. Each segment is kept as <file>.part<n> and continued with an HTTP
//   Range request after a failure or an interrupted run, retrying with backoff.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(ROOT, 'scripts', 'model-manifest.json'), 'utf8'));
const OUT = join(ROOT, 'public', 'models', manifest.id, manifest.revision);
const SOURCE = `https://huggingface.co/${manifest.id}/resolve/${manifest.revision}`;
const ATTEMPTS = 8;
const SEGMENTS = 8;
const SEGMENT_MIN_BYTES = 4_000_000; // smaller files come in one request

async function digest(path, file) {
  const hash = createHash(file.sha256 ? 'sha256' : 'sha1');
  if (!file.sha256) hash.update(`blob ${file.size}\0`); // git's blob id
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function verified(path, file) {
  if (!existsSync(path) || (await stat(path)).size !== file.size) return false;
  return (await digest(path, file)) === (file.sha256 ?? file.gitBlob);
}

const sizeOf = async (path) => (existsSync(path) ? (await stat(path)).size : 0);

/** Bytes [start, end) of `url` into `part`, resuming what's already there. */
async function fetchRange(url, part, start, end, progress) {
  for (let attempt = 1; ; attempt++) {
    const have = await sizeOf(part);
    if (have === end - start) return;
    try {
      const response = await fetch(url, {
        headers: { Range: `bytes=${start + have}-${end - 1}` },
        signal: AbortSignal.timeout(30 * 60_000),
      });
      if (response.status !== 206 || !response.body) {
        throw new Error(`HTTP ${response.status} for a range request`);
      }
      const handle = await open(part, 'a');
      try {
        for await (const chunk of response.body) {
          await handle.write(chunk);
          progress(chunk.length);
        }
      } finally {
        await handle.close();
      }
      const got = await sizeOf(part);
      if (got !== end - start) throw new Error(`segment has ${got} of ${end - start} bytes`);
      return;
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
      const wait = Math.min(2 ** attempt, 60);
      console.log(`  ${part}: ${error.message}; retrying in ${wait} s`);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  }
}

async function download(file, target) {
  const count = file.size >= SEGMENT_MIN_BYTES ? SEGMENTS : 1;
  const step = Math.ceil(file.size / count);
  const segments = Array.from({ length: count }, (_, n) => ({
    part: `${target}.part${n}`,
    start: n * step,
    end: Math.min((n + 1) * step, file.size),
  }));

  let received = 0;
  for (const { part } of segments) received += await sizeOf(part);
  const started = Date.now();
  const timer = setInterval(() => {
    const rate = received / Math.max((Date.now() - started) / 1000, 1);
    console.log(
      `  ${file.path}: ${(received / 1e6).toFixed(1)} of ${(file.size / 1e6).toFixed(1)} MB` +
        ` (${(rate / 1024).toFixed(0)} KB/s incl. resumed)`,
    );
  }, 10_000);
  try {
    await Promise.all(
      segments.map(({ part, start, end }) =>
        fetchRange(`${SOURCE}/${file.path}`, part, start, end, (n) => (received += n)),
      ),
    );
  } finally {
    clearInterval(timer);
  }

  await writeFile(target, new Uint8Array());
  for (const { part } of segments) {
    await appendFile(target, await readFile(part));
    await rm(part);
  }
}

for (const file of manifest.files) {
  const target = join(OUT, file.path);
  if (await verified(target, file)) continue;
  console.log(`Downloading ${manifest.id}@${manifest.revision.slice(0, 7)}/${file.path}`);
  await mkdir(dirname(target), { recursive: true });
  await download(file, target);
  if (!(await verified(target, file))) {
    await rm(target);
    throw new Error(`${file.path} doesn't match the pinned hash; deleted it`);
  }
}
console.log(`Model ready in ${OUT}`);

/*
 * How many threads ONNX Runtime's WebAssembly backend gets (ADR 0004).
 * - Several threads need SharedArrayBuffer, which browsers only allow on a cross-origin
 *   isolated page (COOP: same-origin + COEP: require-corp; vite.config.ts, vercel.json).
 *   Without isolation: 1 thread. The match still works, just slower; never an error.
 * - With isolation: one per logical CPU, capped at 4. More threads give little for a model
 *   this small, and the rest of the page (and the OS) needs CPU too.
 * - `requested` (the benchmark's ?threads=) can lower the count, never raise it.
 */

export const MAX_THREADS = 4;

export function wasmThreads(
  isolated: boolean,
  logicalCpus: number | undefined,
  requested?: number,
): number {
  if (!isolated) return 1;
  const cpus = Number.isFinite(logicalCpus) && logicalCpus ? Math.floor(logicalCpus) : 1;
  const available = Math.max(1, Math.min(MAX_THREADS, cpus));
  if (requested === undefined || !Number.isFinite(requested)) return available;
  return Math.max(1, Math.min(available, Math.floor(requested)));
}

import { handleRequest } from '../embedding/embed-runtime';
import type { WorkerRequest } from '../embedding/protocol';

/*
 * Bench-only: the embedding runtime on the page's main thread, behind the Worker
 * interface `createEmbeddingClient` expects. Chrome DevTools' CPU throttling doesn't
 * reach Web Workers (measured: 4x throttling left worker timings unchanged), so the
 * "phone proxy" measurement runs here. The app itself always uses the real worker.
 */
export class MainThreadWorker extends EventTarget {
  postMessage(request: WorkerRequest) {
    // Async, like a real worker: the caller finishes its turn before work starts.
    queueMicrotask(() => {
      handleRequest(request, (message) => {
        this.dispatchEvent(new MessageEvent('message', { data: message }));
      });
    });
  }

  terminate() {
    // Nothing to stop: the runtime lives as long as the page.
  }
}

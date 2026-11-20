/*
 * The embedding worker: runs `embed-runtime.ts` off the main thread, so a match never
 * freezes the page. The runtime's header comment has the details (ADR 0004).
 */
import { handleRequest } from './embed-runtime';
import type { WorkerRequest, WorkerResponse } from './protocol';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  handleRequest(event.data, (message: WorkerResponse, transfer: Transferable[] = []) => {
    self.postMessage(message, { transfer });
  });
};

// pdf.js's legacy worker, loaded on the main thread by the resume import tests
// (real-files.test.ts). The package ships no declaration for it; only its presence on
// `globalThis.pdfjsWorker` matters to pdf.js.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}

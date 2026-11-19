/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix = load all vars (these are dev-server settings, never exposed to client code).
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // `@/` → src/ (mirrored in tsconfig.app.json "paths")
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // Same-origin in dev too: the browser calls /api/*, Vite forwards to FastAPI.
      // In production Vercel rewrites /api/* to the Render backend.
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET ?? 'http://localhost:8000',
          changeOrigin: true,
        },
      },
      // Docker Desktop on Windows/macOS doesn't forward file-change events into
      // bind mounts reliably; polling makes HMR work inside the container.
      watch: env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
      // Measurement aid (docs/adr/0004): cross-origin isolation lets ONNX Runtime use
      // several threads. Off by default; production doesn't send these headers yet.
      headers:
        env.CROSS_ORIGIN_ISOLATED === 'true'
          ? {
              'Cross-Origin-Opener-Policy': 'same-origin',
              'Cross-Origin-Embedder-Policy': 'credentialless',
            }
          : undefined,
    },
    // The embedding worker (features/match/embedding) is an ES module that imports
    // Transformers.js; the default "iife" format can't code-split it.
    worker: { format: 'es' },
    // Pre-bundled up front: otherwise the dev server only finds it when the worker starts
    // and reloads the page mid-download.
    optimizeDeps: { include: ['@huggingface/transformers'] },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Integration tests mount the real app; a cold run compiles lazy route chunks on
      // demand, which under parallel load can exceed the 5 s default for one test.
      testTimeout: 15_000,
      // Vitest stubs CSS imports by default; the token tests read the real stylesheets.
      css: { include: [/src\/styles\/.+\.css/] },
    },
  };
});

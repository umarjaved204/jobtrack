/// <reference types="vitest/config" />
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { type Connect, defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * A missing file under /models/ is a 404, not the SPA's index.html. Transformers.js probes
 * optional model files (e.g. generation_config.json) and treats a 404 as "not there"; an
 * HTML page instead fails as invalid JSON. Same rule as vercel.json and the nginx image.
 */
function modelFilesAre404(): Plugin {
  const publicDir = fileURLToPath(new URL('./public', import.meta.url));
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
    if (path.startsWith('/models/') && !existsSync(publicDir + path)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    next();
  };
  return {
    name: 'jobtrack:model-files-404',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

/**
 * Cross-origin isolation (ADR 0004): with these, `crossOriginIsolated` is true, so the
 * embedding worker gets SharedArrayBuffer and ONNX Runtime can use several threads. Sent
 * on every response (the app is an SPA); the same pair is in vercel.json and the nginx
 * image (src/features/match/embedding/cross-origin-isolation.test.ts keeps them in step).
 * require-corp blocks cross-origin subresources without CORP/CORS headers: today there
 * are none (fonts are self-hosted). COOP: same-origin rules out popup-based OAuth.
 */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix = load all vars (these are dev-server settings, never exposed to client code).
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss(), modelFilesAre404()],
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
      headers: ISOLATION_HEADERS,
    },
    // `pnpm preview` serves the production build: same headers (its proxy defaults to
    // server.proxy, so /api works there too).
    preview: { headers: ISOLATION_HEADERS },
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

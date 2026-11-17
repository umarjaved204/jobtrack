/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix = load all vars (these are dev-server settings, never exposed to client code).
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
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
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      // Vitest stubs CSS imports by default; the token tests read the real stylesheets.
      css: { include: [/src\/styles\/.+\.css/] },
    },
  };
});

// End-to-end tests: Chromium against the production build (`vite preview`, with the same
// COOP/COEP headers as production) and a real API on a fresh database.
//
//   pnpm e2e              build, start both servers, run every flow
//   pnpm e2e --ui         the same, in Playwright's UI mode
//
// Needs Postgres (`docker compose up -d db`) and Chromium (`pnpm exec playwright install
// chromium`, once). The API is backend/scripts/e2e_server.py: it drops and recreates the
// `jobtrack_e2e` database on every start, so it is never reused. Ports 8001 and 4173 keep
// clear of the dev stack (8000, 5173), which can stay up.
import { defineConfig, devices } from '@playwright/test';

import { API_PORT, BASE_URL, WEB_PORT } from './e2e/support/env.ts';

const CI = Boolean(process.env.CI);
// `uv` may not be on PATH on Windows: UV="py -m uv" pnpm e2e.
const UV = process.env.UV ?? 'uv';
// CI builds in its own step (clearer logs, and the build can be checked on its own).
const PREVIEW = `pnpm preview --port ${WEB_PORT} --strictPort`;
const WEB_COMMAND = process.env.E2E_SKIP_BUILD ? PREVIEW : `pnpm build && ${PREVIEW}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Whole flows in a real browser: ~10 s alone, but past 30 s with four in parallel on a
  // laptop (measured). Steps still fail fast on their own 5 s expect timeout.
  timeout: 60_000,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // One worker in CI: the runners have 2-4 cores and the match flow runs ONNX on several.
  workers: CI ? 1 : undefined,
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      command: `${UV} run python -m scripts.e2e_server`,
      cwd: '../backend',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health/ready`,
      env: { E2E_API_PORT: String(API_PORT) },
      // Never reuse: a fresh database per run is the point.
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      name: 'web',
      command: WEB_COMMAND,
      url: BASE_URL,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      // Locally a preview you started yourself is reused (it must proxy to API_PORT).
      reuseExistingServer: !CI,
      // A cold build, plus the model download when public/models is empty.
      timeout: 600_000,
    },
  ],
});

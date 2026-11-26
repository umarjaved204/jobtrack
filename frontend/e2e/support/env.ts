// Where the e2e servers listen (see playwright.config.ts). The app is on `localhost` (where
// `vite preview` binds): a secure context over plain HTTP, which crossOriginIsolated and
// Web Locks need. The API is only reached through the preview's /api proxy, plus the
// readiness check.
export const API_PORT = Number(process.env.E2E_API_PORT ?? 8001);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);
export const BASE_URL = `http://localhost:${WEB_PORT}`;

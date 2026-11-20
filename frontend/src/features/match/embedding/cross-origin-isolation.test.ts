import { describe, expect, it } from 'vitest';

import dockerfile from '../../../../Dockerfile?raw';
import vercelJson from '../../../../vercel.json?raw';
import viteConfig from '../../../../vite.config.ts?raw';

/*
 * Cross-origin isolation (ADR 0004) gives the embedding worker several threads. Every way
 * the app is served must send the same two headers on every path, or production silently
 * falls back to one thread: the Vite dev server and `vite preview`, Vercel, and the nginx
 * image (which mirrors Vercel's rules).
 */
const COOP = 'same-origin';
const COEP = 'require-corp';

interface VercelHeaders {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

describe('cross-origin isolation headers', () => {
  it('are sent by Vercel on every path', () => {
    const { headers } = JSON.parse(vercelJson) as VercelHeaders;
    const all = headers.find((rule) => rule.source === '/(.*)');
    expect(all?.headers).toEqual(
      expect.arrayContaining([
        { key: 'Cross-Origin-Opener-Policy', value: COOP },
        { key: 'Cross-Origin-Embedder-Policy', value: COEP },
      ]),
    );
  });

  it('are sent by the Vite dev server and preview', () => {
    expect(viteConfig).toContain(`'Cross-Origin-Opener-Policy': '${COOP}'`);
    expect(viteConfig).toContain(`'Cross-Origin-Embedder-Policy': '${COEP}'`);
    expect(viteConfig).toMatch(/server: \{[\s\S]*headers: ISOLATION_HEADERS/);
    expect(viteConfig).toMatch(/preview: \{ headers: ISOLATION_HEADERS \}/);
  });

  it('are sent by the nginx image, for every location', () => {
    expect(dockerfile).toContain(`add_header Cross-Origin-Opener-Policy ${COOP};`);
    expect(dockerfile).toContain(`add_header Cross-Origin-Embedder-Policy ${COEP};`);
    // nginx drops server-level add_header in any location that sets its own.
    const locations = dockerfile.match(/location [^{]+\{[^}]*\}/g) ?? [];
    expect(locations.length).toBeGreaterThan(0);
    for (const location of locations) expect(location).not.toContain('add_header');
  });
});

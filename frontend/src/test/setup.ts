import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { session } from '@/lib/api/session';
import { resetThemeForTests } from '@/lib/theme';

import { server } from './msw';
import { clearQueryClients, settleQueryClients } from './query-clients';

// Animations jump straight to their end state: jsdom has no real frame loop, and tests
// assert outcomes (visible, focused), not motion.
MotionGlobalConfig.skipAnimations = true;

// NumberFlow (animated counters) can't run in jsdom; see number-flow-stub.tsx.
vi.mock('@number-flow/react', () => import('./number-flow-stub'));

// findBy*/waitFor: the first visit to a lazy route compiles its chunk on demand in Vitest.
// Cold, under a full parallel run (more so with a dev server busy alongside), that can
// pass 5 s. 10 s keeps those runs green; a genuine failure just reports a little later.
// (testTimeout in vite.config.ts is 15 s.)
configure({ asyncUtilTimeout: 10_000 });

// Network: MSW. An unhandled request is a test bug (or a missing handler), so it fails.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

afterEach(async () => {
  // Let requests the test left in flight finish while the app is still mounted (see
  // query-clients.ts), so nothing reaches React after the environment is torn down.
  await settleQueryClients();
  // RTL only auto-cleans when test globals are enabled; we import from 'vitest' explicitly.
  cleanup();
  await clearQueryClients();
  server.resetHandlers();
  // Module singletons must not leak between tests: the in-memory token, the theme cache.
  session.reset();
  localStorage.clear();
  document.documentElement.className = '';
  delete document.documentElement.dataset['accent'];
  resetThemeForTests();
});

/*
 * jsdom gaps that Radix primitives touch (menus, popovers, tooltips).
 * Minimal no-op stand-ins: tests assert behaviour, not layout.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
// jsdom has no matchMedia. Default: light OS, no reduced-motion preference.
// Tests that need another answer replace it with vi.spyOn(window, 'matchMedia').
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  };
}

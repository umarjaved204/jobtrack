import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach } from 'vitest';

// Animations jump straight to their end state: jsdom has no real frame loop, and tests
// assert outcomes (visible, focused), not motion.
MotionGlobalConfig.skipAnimations = true;

// RTL only auto-cleans when test globals are enabled; we import from 'vitest' explicitly.
afterEach(() => {
  cleanup();
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

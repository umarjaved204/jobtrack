import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept in sync as the window changes. For layouts that
 * render *different* components (not just restyle), so the hidden one isn't in the DOM.
 * Tests: jsdom's stub (src/test/setup.ts) answers false; spy on matchMedia for wide.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

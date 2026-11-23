import { useEffect } from 'react';

import { isPaletteShortcut } from './commands';

/** Calls `onToggle` on ⌘K / Ctrl+K anywhere on the page, instead of the browser's own. */
export function usePaletteShortcut(onToggle: () => void, apple: boolean) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isPaletteShortcut(event, apple)) return;
      event.preventDefault();
      onToggle();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onToggle, apple]);
}

import { AnimatePresence, m } from 'motion/react';
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router';

import { CommandPalette } from '@/app/command-palette/command-palette';
import { isApplePlatform } from '@/app/command-palette/commands';
import { usePaletteShortcut } from '@/app/command-palette/use-palette-shortcut';
import { SkipLink } from '@/components/skip-link';
import { OfferCelebration } from '@/features/applications/offer-celebration/offer-celebration';
import { session } from '@/lib/api/session';
import { duration, ease } from '@/lib/motion';

import { Masthead } from './masthead';

/**
 * False from the instant the session ends. Sign-out clears the query cache, then navigates
 * to /login; until that lands, anything still mounted here can re-create its query (a
 * request settling re-renders its component) and fetch again without a token. The listener
 * runs synchronously in sign-out, so React drops the signed-in tree first.
 */
function useSessionActive() {
  return useSyncExternalStore(
    (onChange) => session.onSignedOut(() => onChange()),
    () => session.getAccessToken() !== null,
  );
}

/** Thin brand-coloured bar while a route (lazy chunk) is loading. */
function NavigationProgress() {
  const navigation = useNavigation();
  return (
    <AnimatePresence>
      {navigation.state !== 'idle' && (
        <m.div
          aria-hidden="true"
          className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-brand"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 0.85, transition: { duration: 2, ease: ease.outExpo } }}
          exit={{ scaleX: 1, opacity: 0, transition: { duration: duration.base } }}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * After client-side navigation, move focus to the new page's h1 so screen readers
 * announce it and keyboard users start at the top of the content. Skips the first render.
 */
function useFocusPageHeadingOnNavigate(container: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    container.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [pathname, container]);
}

function AppShell() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useFocusPageHeadingOnNavigate(mainRef);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [apple] = useState(isApplePlatform);
  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  usePaletteShortcut(togglePalette, apple);
  const sessionActive = useSessionActive();

  // Signing out: render nothing for the moment until /login replaces the shell.
  if (!sessionActive) return null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <NavigationProgress />

      <Masthead apple={apple} onOpenPalette={() => setPaletteOpen(true)} />

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto w-full max-w-page flex-1 page-gutter py-8 outline-none"
      >
        {/* Entrance-only transition: no exit, so navigation never waits on animation.
            MotionConfig reducedMotion="user" drops the movement for reduced-motion users. */}
        <m.div
          key={pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.outQuint }}
        >
          <Outlet />
        </m.div>
      </main>

      <footer className="mx-auto w-full max-w-page page-gutter pb-8">
        <p className="pt-3 text-xs text-muted-foreground rule-hairline">
          JobTrack · Set in Fraunces &amp; Instrument Sans
        </p>
      </footer>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {/* Outside <main>: its page transition transforms, which would pin `fixed` to it. */}
      <OfferCelebration />
      <ScrollRestoration />
    </div>
  );
}

export { AppShell };

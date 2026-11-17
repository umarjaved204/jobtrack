import { Menu } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { type RefObject, useEffect, useRef } from 'react';
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router';

import { navItems } from '@/app/navigation';
import { SkipLink } from '@/components/skip-link';
import { ThemeMenu } from '@/components/theme-menu';
import { UserMenu } from '@/components/user-menu';
import { Wordmark } from '@/components/wordmark';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

const dateline = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Desktop section bar under the masthead's double rule. */
function SectionNav() {
  return (
    <nav aria-label="Sections" className="hidden rule-double md:block">
      <ul className="flex flex-wrap border-b">
        {navItems.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center px-4 py-3 text-sm font-semibold transition-colors duration-(--duration-fast)',
                  'after:absolute after:inset-x-4 after:-bottom-px after:h-[3px] after:origin-left after:scale-x-0 after:bg-brand after:transition-transform after:duration-(--duration-base) after:ease-out-quint',
                  isActive
                    ? 'text-foreground after:scale-x-100'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Phone/tablet: the same sections in a left drawer. */
function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader className="border-b">
          <SheetTitle translate="no" className="display-face text-3xl">
            Job<span className="text-brand">Track</span>
          </SheetTitle>
          <SheetDescription>Sections</SheetDescription>
        </SheetHeader>
        <nav aria-label="Sections" className="px-3">
          <ul className="grid gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <SheetClose asChild>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 font-semibold',
                        isActive ? 'bg-primary-tint text-primary-text' : 'hover:bg-accent',
                      )
                    }
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {label}
                  </NavLink>
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
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

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <NavigationProgress />

      <header className="mx-auto w-full max-w-page px-4 pt-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 border-b pb-2">
          <p className="kicker text-muted-foreground">{dateline.format(new Date())}</p>
          <div className="flex items-center gap-1">
            <ThemeMenu />
            <UserMenu />
          </div>
        </div>
        <div className="flex items-center gap-2 py-4 md:items-end md:justify-between md:py-6">
          <MobileNav />
          <Wordmark to="/dashboard" />
          <p className="hidden font-display text-lg text-muted-foreground italic md:block">
            The job hunt, in print.
          </p>
        </div>
        <SectionNav />
      </header>

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto w-full max-w-page flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8"
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

      <footer className="mx-auto w-full max-w-page px-4 pb-8 sm:px-6 lg:px-8">
        <p className="pt-3 text-xs text-muted-foreground rule-hairline">
          JobTrack · Set in Fraunces &amp; Instrument Sans
        </p>
      </footer>

      <ScrollRestoration />
    </div>
  );
}

export { AppShell };

import { useQuery } from '@tanstack/react-query';
import { Menu, Plus } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router';

import { CommandPaletteTrigger } from '@/app/command-palette/command-palette';
import { navItems } from '@/app/navigation';
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
import { addApplicationState } from '@/features/applications/add-application-state';
import { applicationsListQuery } from '@/features/applications/api';
import { dateline } from '@/lib/dates';
import { cn } from '@/lib/utils';

/**
 * Opens the add form on the Applications page (navigation state, like the ⌘K command).
 * On that page it keeps the current filters instead of resetting the list.
 */
function AddApplicationLink({ className }: { className?: string }) {
  const { pathname, search } = useLocation();
  const keepSearch = pathname === '/applications' ? search : '';
  return (
    <Button asChild className={cn('gap-2', className)}>
      <Link to={{ pathname: '/applications', search: keepSearch }} state={addApplicationState}>
        <Plus aria-hidden="true" />
        Add application
      </Link>
    </Button>
  );
}

function onFileText(total: number) {
  if (total === 0) return 'Nothing on file yet';
  return `${total.toLocaleString()} ${total === 1 ? 'application' : 'applications'} on file`;
}

/** "34 applications on file": the paper's circulation line. Blank until it loads. */
function OnFileCount() {
  const total = useQuery({ ...applicationsListQuery({ page_size: 1 }), select: (p) => p.total });
  return (
    <p className="min-h-4 kicker text-muted-foreground">
      {total.data === undefined ? null : onFileText(total.data)}
    </p>
  );
}

/** Desktop section bar under the double rule, with the add button at its end. */
function SectionNav() {
  return (
    <nav
      aria-label="Sections"
      className="hidden items-center justify-between gap-3 border-b md:flex"
    >
      <ul className="flex flex-wrap gap-1">
        {navItems.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex min-h-12 items-center px-3.5 text-base transition-colors duration-(--duration-fast)',
                  'after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:origin-left after:scale-x-0 after:bg-brand after:transition-transform after:duration-(--duration-base) after:ease-out-quint',
                  isActive
                    ? 'font-bold text-foreground after:scale-x-100'
                    : 'font-medium text-muted-foreground hover:text-foreground',
                )
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <AddApplicationLink className="my-1" />
    </nav>
  );
}

/** Phone/tablet: the sections (and the add button) in a left drawer. */
function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2.5 size-11 md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5.5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader className="border-b">
          <SheetTitle translate="no" className="display-face text-3xl">
            Job<span className="text-brand">Track</span>
          </SheetTitle>
          <SheetDescription>Sections</SheetDescription>
        </SheetHeader>
        <nav aria-label="Sections" className="grid gap-4 px-3">
          <ul className="grid gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <SheetClose asChild>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-11 items-center gap-3 px-3 font-semibold',
                        isActive
                          ? 'bg-primary-tint text-primary-text shadow-[inset_3px_0_0_var(--brand)]'
                          : 'hover:bg-accent',
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
          <SheetClose asChild>
            <AddApplicationLink className="h-11 justify-self-start" />
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The broadsheet masthead. One set of controls serves every width (CSS grid areas move
 * them), so nothing is duplicated in the DOM or the accessibility tree:
 * - phone: menu · nameplate · search, theme, account; then the double rule
 * - desktop: dateline · search, theme, account / hairline / nameplate · tagline and the
 *   count / double rule / section bar
 */
function Masthead({ apple, onOpenPalette }: { apple: boolean; onOpenPalette: () => void }) {
  return (
    <header className="mx-auto w-full max-w-page page-gutter">
      <div
        className={cn(
          'grid items-center gap-x-3 pt-3.5 md:pt-0',
          "grid-cols-[auto_1fr_auto] [grid-template-areas:'menu_mark_tools']",
          "md:grid-cols-[1fr_auto] md:[grid-template-areas:'date_tools''line_line''mark_tag']",
        )}
      >
        <div className="[grid-area:menu] md:hidden">
          <MobileNav />
        </div>
        <p className="hidden kicker text-muted-foreground [grid-area:date] md:block">
          {dateline.format(new Date())}
        </p>
        <div className="-mr-2.5 flex items-center gap-1 [grid-area:tools] md:mr-0 md:gap-2 md:py-2">
          <CommandPaletteTrigger apple={apple} onOpen={onOpenPalette} />
          <ThemeMenu />
          <UserMenu />
        </div>
        <div aria-hidden="true" className="hidden border-b [grid-area:line] md:block" />
        <Wordmark
          to="/dashboard"
          className="justify-self-center text-[1.875rem] tracking-[-0.03em] [grid-area:mark] md:justify-self-start md:pt-4.5 md:pb-3.5 md:text-6xl md:leading-[0.9]"
        />
        <div className="hidden flex-col items-end gap-1 self-end pb-3.5 [grid-area:tag] md:flex">
          <p className="font-display text-xl text-foreground italic">The job hunt, in print.</p>
          <OnFileCount />
        </div>
      </div>
      {/* The masthead's double rule: heavy over hairline, 2px apart. */}
      <div aria-hidden="true" className="mt-2 h-1.5 border-t-[3px] border-b border-rule md:mt-0" />
      <SectionNav />
    </header>
  );
}

export { Masthead };

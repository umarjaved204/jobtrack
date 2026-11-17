import { Outlet } from 'react-router';

import { ThemeMenu } from '@/components/theme-menu';
import { Wordmark } from '@/components/wordmark';
import { SampleWeek } from '@/features/landing/sample-week';

/**
 * Sign-in / sign-up frame: the masthead, the form on the left, and the sample week on the
 * right on wide screens (decorative here, so hidden from assistive tech).
 */
function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-page px-4 pt-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 pb-4">
          <Wordmark to="/" />
          <ThemeMenu />
        </div>
        <div className="rule-double" />
      </header>

      <div className="mx-auto grid w-full max-w-page flex-1 px-4 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8">
        <main id="main" className="py-10 sm:py-14 lg:col-span-6 xl:col-span-5">
          <div className="max-w-md">
            <Outlet />
          </div>
        </main>
        <aside aria-hidden="true" className="hidden py-14 lg:col-span-5 lg:col-start-8 lg:block">
          <SampleWeek />
        </aside>
      </div>
    </div>
  );
}

export { AuthLayout };

import { Outlet } from 'react-router';

import { PublicMasthead } from '@/components/public-masthead';
import { SkipLink } from '@/components/skip-link';
import { ThemeMenu } from '@/components/theme-menu';
import { SampleWeek } from '@/features/landing/sample-week';

/**
 * Sign-in / sign-up frame: the public masthead, the form on the left, and the sample week
 * on the right on wide screens (decorative here, so hidden from assistive tech).
 */
function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <PublicMasthead>
        <ThemeMenu />
      </PublicMasthead>

      <div className="mx-auto grid w-full max-w-page flex-1 page-gutter lg:grid-cols-12 lg:gap-8">
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

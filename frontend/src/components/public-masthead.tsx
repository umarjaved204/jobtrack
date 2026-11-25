import type { ReactNode } from 'react';

import { Wordmark } from '@/components/wordmark';
import { dateline } from '@/lib/dateline';

/**
 * The masthead for signed-out pages (landing, sign in, sign up): date line and controls,
 * the nameplate centred over the tagline, then the double rule. The app's own masthead
 * (app/layouts/masthead.tsx) adds search, the account menu and the section bar.
 */
function PublicMasthead({ children }: { children: ReactNode }) {
  return (
    <header className="mx-auto w-full max-w-page page-gutter">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b py-2">
        <p className="kicker text-muted-foreground">
          <span className="hidden sm:inline">{dateline.format(new Date())} · </span>Free to use
        </p>
        <div className="-mr-2.5 flex items-center gap-1 sm:gap-2">{children}</div>
      </div>
      <div className="grid justify-items-center gap-2.5 pt-6 pb-4 text-center">
        <Wordmark
          to="/"
          className="text-[clamp(3.5rem,9vw,7rem)] leading-[0.9] tracking-[-0.03em] md:text-[clamp(3.5rem,9vw,7rem)]"
        />
        <p className="font-display text-xl text-foreground italic sm:text-[1.375rem]">
          The job hunt, in print.
        </p>
      </div>
      {/* The double rule: heavy over hairline, 2px apart. */}
      <div aria-hidden="true" className="h-1.5 border-t-[3px] border-b border-rule" />
    </header>
  );
}

export { PublicMasthead };

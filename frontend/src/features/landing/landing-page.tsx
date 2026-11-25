import { lazy, Suspense } from 'react';
import { Link } from 'react-router';

import { PublicMasthead } from '@/components/public-masthead';
import { SkipLink } from '@/components/skip-link';
import { ThemeMenu } from '@/components/theme-menu';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/hooks';
import type { User } from '@/types/auth';

// The form brings React Hook Form and Zod: loaded after the hero, so the page's first
// download stays small (the heading is the largest paint, not the form).
const LoginForm = lazy(() =>
  import('@/features/auth/login-form').then((module) => ({ default: module.LoginForm })),
);

/** Figures are examples, and the captions say so. */
const features = [
  {
    kicker: 'The pipeline',
    title: 'Seven columns, one drag',
    body: 'Wishlist to offer on a board you can drive by mouse, touch or keyboard. Every move goes on the record.',
    figure: '7',
    caption: 'stages, with the exits kept apart',
  },
  {
    kicker: 'The figures',
    title: 'Know what’s working',
    body: 'Interview rate from real history, a funnel that counts each application once, and which sources pay off.',
    figure: '25%',
    caption: 'for example, 3 interviews from 12 applications',
  },
  {
    kicker: 'The match',
    title: 'Check before you send',
    body: 'Paste a job description, pick a resume version, and see the evidence and the gaps. The model runs on your device.',
    figure: '74',
    caption: 'an example score: strong overlap',
  },
];

/**
 * Staggered entrance for the hero: the page's single orchestrated motion moment.
 * Durations are motion tokens, so prefers-reduced-motion turns it off.
 */
const riseDelay = (delayMs: number) => ({ animationDelay: `${delayMs}ms` });

/**
 * The public front page, with sign-in beside the pitch. It renders immediately: the
 * session check runs in the background (no loader), and once it resolves a signed-in
 * visitor gets "Open your dashboard" in place of the sign-in form, instead of an
 * automatic redirect.
 */
function LandingPage() {
  const user = useCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <title>JobTrack: every application, on the record</title>
      <SkipLink />

      <PublicMasthead>
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          <ThemeMenu />
          {user ? (
            <Button asChild variant="link" size="sm">
              <Link to="/dashboard">Open your dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="link" size="sm">
              <a href="#signin">Sign in</a>
            </Button>
          )}
        </nav>
      </PublicMasthead>

      <main
        id="main"
        className="mx-auto flex w-full max-w-page flex-1 flex-wrap gap-14 page-gutter pt-10 pb-14"
      >
        <section
          aria-labelledby="hero-heading"
          className="grid min-w-0 flex-[999_1_35rem] content-start gap-5.5"
        >
          <p style={riseDelay(0)} className="animate-rise-in kicker text-primary-text">
            Front page
          </p>
          <h1
            id="hero-heading"
            className="display-face text-[clamp(3rem,6.4vw,5.75rem)] leading-[0.95] font-semibold tracking-[-0.025em]"
            style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1" }}
          >
            <span style={riseDelay(0)} className="block animate-rise-in">
              Every application,
            </span>{' '}
            {/* ↑ explicit space: the lines are separate blocks visually, but the heading's
                accessible name must still read "application, on". */}
            <span style={riseDelay(90)} className="block animate-rise-in">
              on the record.
            </span>
          </h1>
          <p
            style={riseDelay(180)}
            className="max-w-160 animate-rise-in text-[1.3125rem] leading-normal"
          >
            Track each role from wishlist to offer, see how far your applications really get, and
            check a resume against a job description before you send it.
          </p>
          {/* Signed in, the card beside the hero offers the dashboard instead. */}
          {!user && (
            <div style={riseDelay(270)} className="flex animate-rise-in flex-wrap gap-2.5">
              <Button asChild size="lg">
                <Link to="/register">Start tracking, free</Link>
              </Button>
            </div>
          )}

          <ul
            aria-label="What JobTrack does"
            className="mt-5.5 grid gap-y-8 border-t border-rule md:grid-cols-3"
          >
            {features.map((f, i) => (
              <li
                key={f.title}
                className={
                  i < features.length - 1
                    ? 'grid content-start gap-2.5 pt-4.5 md:mr-5 md:border-r md:pr-5'
                    : 'grid content-start gap-2.5 pt-4.5'
                }
              >
                <p className="kicker text-muted-foreground">{f.kicker}</p>
                <h2 className="font-display text-[1.625rem] leading-tight font-semibold">
                  {f.title}
                </h2>
                <p className="text-[0.9375rem] leading-relaxed">{f.body}</p>
                <p className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.03em] tabular-nums">
                  {f.figure}
                </p>
                <p className="text-[0.8125rem] text-muted-foreground">{f.caption}</p>
              </li>
            ))}
          </ul>
        </section>

        <aside
          id="signin"
          aria-labelledby="signin-heading"
          className="w-full max-w-110 flex-[1_1_22.5rem] scroll-mt-6"
        >
          <div className="grid gap-4 border border-rule bg-card p-7 shadow-print">
            {user ? <SignedInCard user={user} /> : <SignInCard />}
          </div>
          <p className="mt-4.5 text-[0.8125rem] leading-normal text-muted-foreground">
            Your session stays private to this browser: the access token lives in memory, never in
            local storage.
          </p>
        </aside>
      </main>

      <footer className="mx-auto w-full max-w-page page-gutter pb-8">
        <p className="border-t border-rule pt-3.5 text-[0.8125rem] text-muted-foreground">
          JobTrack is a portfolio project. Your data stays in your account.
        </p>
      </footer>
    </div>
  );
}

function SignInCard() {
  return (
    <>
      <h2 id="signin-heading" className="font-display text-[2.125rem] font-semibold">
        Sign in
      </h2>
      <Suspense
        fallback={
          <Loading label="Loading the sign-in form">
            <Skeleton className="h-64" />
          </Loading>
        }
      >
        <LoginForm next="/dashboard" />
      </Suspense>
      <p className="text-sm">
        New here?{' '}
        <Link to="/register" className="link">
          Create an account
        </Link>
      </p>
    </>
  );
}

function SignedInCard({ user }: { user: User }) {
  return (
    <>
      <h2 id="signin-heading" className="font-display text-[2.125rem] font-semibold">
        Welcome back
      </h2>
      <p>
        You’re signed in as <strong>{user.full_name}</strong>.
      </p>
      <Button asChild size="lg">
        <Link to="/dashboard">Open your dashboard</Link>
      </Button>
    </>
  );
}

export { LandingPage };

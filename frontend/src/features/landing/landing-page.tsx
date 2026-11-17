import { Link } from 'react-router';

import { SkipLink } from '@/components/skip-link';
import { ThemeMenu } from '@/components/theme-menu';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { useCurrentUser } from '@/features/auth/hooks';

import { SampleWeek } from './sample-week';

const features = [
  {
    title: 'Your pipeline at a glance',
    body: 'Drag applications from wishlist to offer on a board, or search and filter them in a table.',
  },
  {
    title: 'Never miss a follow-up',
    body: 'Interviews, deadlines and reminders sit on one calendar, next to the role they belong to.',
  },
  {
    title: 'Tailor every resume',
    body: 'Paste a job description to see the skills your resume is missing and the keywords to add.',
  },
];

/**
 * Staggered entrance for the hero: the page's single orchestrated motion moment.
 * Durations are motion tokens, so prefers-reduced-motion turns it off.
 */
const riseDelay = (delayMs: number) => ({ animationDelay: `${delayMs}ms` });

/**
 * The public front page. It renders immediately: the session check runs in the background
 * (no loader), and once it resolves a signed-in visitor gets "Open your dashboard" in
 * place of the sign-up/sign-in calls to action, instead of an automatic redirect.
 */
function LandingPage() {
  const user = useCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <title>JobTrack: every application, accounted for</title>
      <SkipLink />

      <header className="mx-auto w-full max-w-page px-4 pt-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 pb-4">
          <Wordmark to="/" />
          <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
            <ThemeMenu />
            {user ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Open your dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link to="/register">Create an account</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
        <div className="rule-double" />
      </header>

      <main id="main" className="mx-auto w-full max-w-page flex-1 px-4 sm:px-6 lg:px-8">
        <section className="grid gap-12 py-12 lg:grid-cols-12 lg:gap-8 lg:py-20">
          <div className="lg:col-span-7">
            <h1
              className="display-face text-display-lg font-semibold"
              style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1" }}
            >
              <span style={riseDelay(0)} className="block animate-rise-in">
                Every application,
              </span>{' '}
              {/* ↑ explicit space: the lines are separate blocks visually, but the heading's
                  accessible name must still read "application, accounted". */}
              <span style={riseDelay(90)} className="block animate-rise-in">
                accounted for.
              </span>
            </h1>
            <p
              style={riseDelay(180)}
              className="mt-8 max-w-[58ch] animate-rise-in text-lg leading-relaxed text-muted-foreground sm:text-xl"
            >
              JobTrack keeps the roles you’ve applied for, the interviews coming up and the offers
              on the table in one place, so nothing slips while you’re busy with the search.
            </p>
            <div style={riseDelay(270)} className="mt-10 flex animate-rise-in flex-wrap gap-3">
              {user ? (
                <Button asChild size="lg">
                  <Link to="/dashboard">Open your dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link to="/register">Create an account</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link to="/login">Sign in</Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          <SampleWeek className="lg:col-span-4 lg:col-start-9 lg:mt-3" />
        </section>

        <section aria-label="What JobTrack does" className="border-t border-rule py-10 lg:py-14">
          <ul className="grid gap-8 md:grid-cols-3 md:gap-0">
            {features.map(({ title, body }, i) => (
              <li
                key={title}
                className={i > 0 ? 'md:border-l md:border-border md:pl-8' : 'md:pr-8'}
              >
                <h2 className="font-display text-2xl font-semibold">{title}</h2>
                <p className="mt-3 max-w-[40ch] text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-page px-4 pb-8 sm:px-6 lg:px-8">
        <p className="pt-3 text-xs text-muted-foreground rule-hairline">
          JobTrack is a portfolio project. Your data stays in your account.
        </p>
      </footer>
    </div>
  );
}

export { LandingPage };

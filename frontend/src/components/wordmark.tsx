import { Link } from 'react-router';

import { cn } from '@/lib/utils';

/** The JobTrack nameplate. Links home (`/` when signed out, the dashboard when signed in). */
function Wordmark({ to, className }: { to: string; className?: string }) {
  return (
    <Link
      to={to}
      translate="no" // brand name: keep it out of browser translation
      className={cn('display-face text-3xl leading-none font-semibold md:text-5xl', className)}
    >
      Job<span className="text-brand">Track</span>
    </Link>
  );
}

export { Wordmark };

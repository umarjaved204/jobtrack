import { RotateCcw } from 'lucide-react';
import { isRouteErrorResponse, Link, Navigate, useRouteError } from 'react-router';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';

function describeError(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return { code: String(error.status), message: error.statusText || 'Request failed.' };
  }
  if (isApiError(error)) {
    // e.g. the API is unreachable while restoring the session (status 0).
    return { code: error.status ? String(error.status) : 'Offline', message: error.detail };
  }
  return {
    code: 'Error',
    message: 'Something went wrong while showing this page. Try again in a moment.',
  };
}

function ErrorMessage({ error }: { error: unknown }) {
  const { code, message } = describeError(error);
  if (import.meta.env.DEV) console.error(error);

  return (
    <section role="alert" className="mx-auto max-w-prose py-16">
      <title>Something went wrong · JobTrack</title>
      <p className="kicker text-destructive">{code}</p>
      <h1 className="mt-2 display-face text-display">Late edition: page failed</h1>
      <p className="mt-4 text-lg text-muted-foreground">{message}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={() => window.location.reload()}>
          <RotateCcw /> Reload
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </section>
  );
}

/** Error inside a page: rendered within the app shell, so navigation keeps working. */
function PageErrorBoundary() {
  return <ErrorMessage error={useRouteError()} />;
}

/** Error in the shell itself: last resort, rendered without the layout. */
function RootErrorBoundary() {
  return (
    <div className="px-4">
      <ErrorMessage error={useRouteError()} />
    </div>
  );
}

/** Shown while the first route's code loads (before the shell can render). */
function AppFallback() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading JobTrack"
      className="mx-auto max-w-page px-4 pt-6 sm:px-6 lg:px-8"
    >
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-8 h-12 w-56" />
      <Skeleton className="mt-8 h-10 w-full" />
      <Skeleton className="mt-10 h-14 w-2/3" />
    </div>
  );
}

/** `/` → dashboard for now. Phase 5 replaces this with the landing / login page. */
function IndexRedirect() {
  return <Navigate to="/dashboard" replace />;
}

export { AppFallback, IndexRedirect, PageErrorBoundary, RootErrorBoundary };

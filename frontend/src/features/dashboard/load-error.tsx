import { RotateCcw } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';

/** A dashboard section that failed to load: what failed, why, and a retry. Each section
 * fails on its own, so one bad query never blanks the whole page. */
function LoadError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Alert title={title}>
      <p>{isApiError(error) ? error.detail : 'Something went wrong.'}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        <RotateCcw /> Try again
      </Button>
    </Alert>
  );
}

export { LoadError };

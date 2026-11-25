import { RotateCcw } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

/**
 * Something that failed to load: what failed, why, and a retry. Used per section, so one
 * failed query never blanks a whole page.
 */
function LoadError({
  title,
  error,
  onRetry,
  className,
}: {
  /** "The calendar didn’t load". Leave out when a heading above already says so. */
  title?: string;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Alert title={title} className={cn('max-w-xl', className)}>
      <p>{isApiError(error) ? error.detail : 'Something went wrong. Try again in a moment.'}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        <RotateCcw /> Try again
      </Button>
    </Alert>
  );
}

export { LoadError };

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';

import { applicationQuery } from './api';

/** Minimal detail page, the board cards' link target. The full page (timeline, contacts,
 * editing) replaces this in the detail-page commit. */
function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const application = useQuery(applicationQuery(id));

  return (
    <>
      <Button asChild variant="link" size="sm" className="mb-4">
        <Link to="/applications">
          <ArrowLeft /> All applications
        </Link>
      </Button>
      {application.isPending && <Skeleton className="h-24 w-full max-w-xl" />}
      {application.isError && (
        <Alert>
          {isApiError(application.error) && application.error.status === 404
            ? 'This application doesn’t exist, or it isn’t yours.'
            : 'This application didn’t load. Try again in a moment.'}
        </Alert>
      )}
      {application.data && (
        <PageHeader
          kicker="Application"
          title={application.data.company}
          description={application.data.role_title}
          actions={<StatusBadge status={application.data.status} />}
        />
      )}
    </>
  );
}

export { ApplicationDetailPage };

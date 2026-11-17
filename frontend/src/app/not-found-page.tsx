import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

function NotFoundPage() {
  return (
    <PageHeader
      kicker="Error 404"
      title="Stop the presses"
      description="We couldn't find that page. It may have moved, or the link may be mistyped."
      actions={
        <Button asChild variant="outline">
          <Link to="/dashboard">
            <ArrowLeft /> Back to dashboard
          </Link>
        </Button>
      }
    />
  );
}

export { NotFoundPage };

import { SquareKanban } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

/** Placeholder until the feature is built; the route, title and layout are final. */
function ApplicationsPage() {
  return (
    <>
      <PageHeader
        kicker="Pipeline"
        title="Applications"
        description="Every role you’re tracking, from wishlist to offer."
      />
      <EmptyState icon={SquareKanban} title="No applications yet" className="mt-10">
        The kanban board, the searchable table and the application form arrive in Phase 6.
      </EmptyState>
    </>
  );
}

export { ApplicationsPage };

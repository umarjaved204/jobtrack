import { FileText } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

/** Placeholder until the feature is built; the route, title and layout are final. */
function ResumesPage() {
  return (
    <>
      <PageHeader
        kicker="Library"
        title="Resume versions"
        description="Keep each version you send, and see which one went where."
      />
      <EmptyState icon={FileText} title="No resume versions yet" className="mt-10">
        Storing resume versions and linking them to applications arrives in Phase 8.
      </EmptyState>
    </>
  );
}

export { ResumesPage };

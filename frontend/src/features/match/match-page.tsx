import { Sparkles } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

/** Placeholder until the feature is built; the route, title and layout are final. */
function MatchPage() {
  return (
    <>
      <PageHeader
        kicker="AI match"
        title="Match a job description"
        description="Paste a job description to score it against one of your resumes."
      />
      <EmptyState icon={Sparkles} title="Matching isn't switched on yet" className="mt-10">
        The match score, missing skills and suggested keywords arrive in Phase 9.
      </EmptyState>
    </>
  );
}

export { MatchPage };

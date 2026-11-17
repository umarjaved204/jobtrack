import { Newspaper } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

/** Placeholder until the feature is built; the route, title and layout are final. */
function DashboardPage() {
  return (
    <>
      <PageHeader
        kicker="Overview"
        title="Dashboard"
        description="Your search at a glance: totals, interview rate, offers and the follow-ups due next."
      />
      <EmptyState icon={Newspaper} title="Your numbers will land here" className="mt-10">
        Stat cards, applications over time, the pipeline funnel and source breakdown arrive with the
        dashboard build (Phase 7).
      </EmptyState>
    </>
  );
}

export { DashboardPage };

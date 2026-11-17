import { CalendarDays } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

/** Placeholder until the feature is built; the route, title and layout are final. */
function CalendarPage() {
  return (
    <>
      <PageHeader
        kicker="Schedule"
        title="Calendar"
        description="Interviews, assessments and deadlines in one place."
      />
      <EmptyState icon={CalendarDays} title="Nothing scheduled" className="mt-10">
        The calendar and follow-up reminders arrive in Phase 8.
      </EmptyState>
    </>
  );
}

export { CalendarPage };

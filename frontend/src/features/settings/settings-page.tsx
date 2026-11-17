import { Settings } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

/** Placeholder until the feature is built; the route, title and layout are final. */
function SettingsPage() {
  return (
    <>
      <PageHeader
        kicker="Account"
        title="Settings"
        description="Profile, appearance and data export."
      />
      <EmptyState icon={Settings} title="Settings are on their way" className="mt-10">
        Profile editing and CSV/JSON export arrive later. Theme and accent already work from the
        menu at the top of the page.
      </EmptyState>
    </>
  );
}

export { SettingsPage };

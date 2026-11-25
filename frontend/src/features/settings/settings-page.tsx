import { Settings } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

import { ExportSection } from './export-section';
import { MatchHistorySection } from './match-history-section';
import { ProfileSection } from './profile-section';

/** Profile, export and match history work now; appearance and account deletion are still
 * a placeholder. The route, title and layout are final. */
function SettingsPage() {
  return (
    <>
      <PageHeader
        kicker="Account"
        title="Settings"
        description="Profile, appearance and your data."
      />
      <div className="mt-10 grid gap-10">
        <ProfileSection />
        <ExportSection />
        <MatchHistorySection />
        <EmptyState icon={Settings} title="More settings are on their way">
          Theme and accent already work from the menu at the top of the page.
        </EmptyState>
      </div>
    </>
  );
}

export { SettingsPage };

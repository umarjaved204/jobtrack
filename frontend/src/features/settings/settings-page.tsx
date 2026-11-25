import { PageHeader } from '@/components/page-header';

import { AccountSection } from './account-section';
import { AppearanceSection } from './appearance-section';
import { ExportSection } from './export-section';
import { MatchHistorySection } from './match-history-section';
import { ProfileSection } from './profile-section';

/** Profile, appearance and your data. The route and title are final. */
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
        <AppearanceSection />
        <ExportSection />
        <MatchHistorySection />
        <AccountSection />
      </div>
    </>
  );
}

export { SettingsPage };

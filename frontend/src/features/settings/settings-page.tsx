import { PageHeader } from '@/components/page-header';

import { AccountSection } from './account-section';
import { AppearanceSection } from './appearance-section';
import { ExportSection } from './export-section';
import { MatchHistorySection } from './match-history-section';
import { ProfileSection } from './profile-section';
import { SettingsSection } from './settings-section';
import { SETTINGS_SECTIONS } from './settings-sections';

/** Profile, appearance, your data and the account, with a side nav to each. */
function SettingsPage() {
  return (
    <>
      <PageHeader
        kicker="Account"
        title="Settings"
        description="Profile, appearance and your data."
      />
      <div className="mt-7 flex flex-wrap gap-x-12 gap-y-6 border-t-[3px] border-rule pt-6">
        <nav
          aria-label="Settings sections"
          className="w-full md:w-auto md:max-w-60 md:flex-[1_1_12.5rem]"
        >
          <ul className="grid grid-cols-2 gap-x-6 md:sticky md:top-6 md:grid-cols-1">
            {SETTINGS_SECTIONS.map(({ id, title }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block border-b py-3 font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid max-w-205 min-w-0 flex-[999_1_35rem] content-start gap-11">
          <ProfileSection />
          <AppearanceSection />
          <SettingsSection id="data" className="gap-5">
            <ExportSection />
            <div className="border-t" />
            <MatchHistorySection />
            <p className="bg-muted p-3.5 text-sm leading-normal">
              Your resumes and job descriptions are stored on JobTrack’s server and never sent to a
              third party.
            </p>
          </SettingsSection>
          <AccountSection />
        </div>
      </div>
    </>
  );
}

export { SettingsPage };

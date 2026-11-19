import { useQuery } from '@tanstack/react-query';
import { FileText, MonitorX, PowerOff } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { applicationsListQuery } from '@/features/applications/api';
import { LoadError } from '@/features/dashboard/load-error';
import { resumesQuery } from '@/features/resumes/api';
import type { MatchConfig } from '@/types/match';

import { matchConfigQuery } from './api';
import { isModelCached } from './embedding/model-cache';
import { checkSupport, UNSUPPORTED_REASONS } from './embedding/support';
import { MatchForm } from './match-form';
import { MatchProgressPanel } from './match-progress';
import { type MatchFormValues, toMatchInput } from './match-schema';
import { MatchScoreCard } from './match-score-card';
import { ModelConsentDialog } from './model-consent-dialog';
import { useMatchRun } from './use-match-run';

/** The most recently updated applications, for the optional link. */
const RECENT_APPLICATIONS = 100;

/**
 * The header renders once, whatever loads below it: the shell focuses the h1 after
 * navigation, so it must not remount when the data arrives.
 */
function MatchPage() {
  return (
    <>
      <PageHeader
        kicker="AI match"
        title="Match a job description"
        description="Paste a job description to see how well one of your resumes covers it."
      />
      <div className="mt-8">
        <MatchBody />
      </div>
    </>
  );
}

function MatchBody() {
  const config = useQuery(matchConfigQuery());

  if (config.isPending) return <Skeleton className="h-96" />;
  if (config.isError) {
    return (
      <LoadError
        title="Couldn’t load matching"
        error={config.error}
        onRetry={() => void config.refetch()}
      />
    );
  }
  if (config.data.embeddings === 'off') {
    return (
      <EmptyState icon={PowerOff} title="Matching is switched off">
        This JobTrack server has the AI match turned off. Everything else works as usual.
      </EmptyState>
    );
  }
  return <MatchWorkspace config={config.data} />;
}

function MatchWorkspace({ config }: { config: MatchConfig }) {
  // Checked once: support doesn't change while the page is open.
  const [unsupported] = useState(() => (config.embeddings === 'client' ? checkSupport() : null));
  const resumes = useQuery(resumesQuery());
  const applications = useQuery(
    applicationsListQuery({ sort: '-updated_at', page_size: RECENT_APPLICATIONS }),
  );
  const run = useMatchRun();
  const [pending, setPending] = useState<MatchFormValues | null>(null);
  const consented = useRef(false);

  if (unsupported) {
    return (
      <EmptyState icon={MonitorX} title="This browser can’t run the match">
        The match runs a small language model on your device. {UNSUPPORTED_REASONS[unsupported]} A
        recent version of Chrome, Edge, Firefox or Safari can run it.
      </EmptyState>
    );
  }
  if (resumes.isPending) return <Skeleton className="h-96" />;
  if (resumes.isError) {
    return (
      <LoadError
        title="Couldn’t load your resumes"
        error={resumes.error}
        onRetry={() => void resumes.refetch()}
      />
    );
  }
  const active = resumes.data.filter((r) => !r.archived_at);
  if (active.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Add a resume to match against"
        action={
          <Button asChild>
            <Link to="/resumes">Add a resume</Link>
          </Button>
        }
      >
        A match compares a job description with one of your resume versions. Paste your resume text
        once, and match it against as many adverts as you like.
      </EmptyState>
    );
  }

  const start = (values: MatchFormValues) => {
    void run.start(toMatchInput(values), config);
  };
  const onRun = async (values: MatchFormValues) => {
    if (config.embeddings === 'client' && config.model && !consented.current) {
      if (!(await isModelCached(config.model))) {
        setPending(values);
        return;
      }
    }
    start(values);
  };
  const { state } = run;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid content-start gap-6">
        <MatchForm
          resumes={active}
          applications={applications.data?.items}
          running={state.status === 'running'}
          error={state.status === 'error' ? state.error : null}
          onRun={(values) => void onRun(values)}
        />
        {state.status === 'running' && (
          <MatchProgressPanel progress={state.progress} onCancel={run.cancel} />
        )}
        {state.status === 'error' && <Alert title="The match didn’t finish">{state.message}</Alert>}
        {state.status === 'done' && <MatchScoreCard match={state.match} />}
      </div>
      <aside className="grid content-start gap-4 border-t pt-6 text-sm text-muted-foreground lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <h2 className="kicker text-foreground">How the match works</h2>
        <p>
          The score combines the skills the advert asks for with how closely your resume’s lines
          match its wording. It’s an estimate of overlap, not how an employer or an applicant
          tracking system will rank you.
        </p>
        {config.embeddings === 'client' && (
          <p>
            The comparison runs on your device. The texts stay between your browser and JobTrack.
          </p>
        )}
        <p>English adverts and resumes only.</p>
      </aside>

      <ModelConsentDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          consented.current = true;
          if (pending) start(pending);
          setPending(null);
        }}
      />
    </div>
  );
}

export { MatchPage };

import { useQuery } from '@tanstack/react-query';
import { FileText, Monitor, MonitorX, PowerOff } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { applicationQuery, applicationsListQuery } from '@/features/applications/api';
import { LoadError } from '@/features/dashboard/load-error';
import { resumesQuery } from '@/features/resumes/api';
import type { Application } from '@/types/application';
import type { MatchConfig } from '@/types/match';

import { matchConfigQuery } from './api';
import { isModelCached, MODEL_DOWNLOAD_MB } from './embedding/model-cache';
import { checkSupport, UNSUPPORTED_REASONS } from './embedding/support';
import { MatchForm } from './match-form';
import { MatchHistory } from './match-history';
import { MatchProgressPanel } from './match-progress';
import { MatchResult } from './match-result';
import {
  linkedValues,
  type MatchFormValues,
  NO_APPLICATION,
  rerunValues,
  toMatchInput,
} from './match-schema';
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
        kicker="Match"
        title="How well does a resume fit the job?"
        description="Paste a job description and choose a resume version. You get a score, the evidence behind it, and the skills the advert asks for that your resume doesn’t mention."
      />
      <div className="mt-7">
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
  const { state: navigationState } = useLocation();
  const [searchParams] = useSearchParams();
  // "Run again" (navigation state) wins over a link from an application's page.
  const [initial] = useState(() => rerunValues(navigationState) ?? linkedValues(searchParams));
  // The picker lists the most recently updated applications: the linked one may be older,
  // so it's fetched (usually cached already: the link comes from its page) and added.
  const linkedId =
    initial && initial.application_id !== NO_APPLICATION ? initial.application_id : null;
  const linked = useQuery({ ...applicationQuery(linkedId ?? ''), enabled: linkedId !== null });

  if (unsupported) {
    return (
      <EmptyState icon={MonitorX} title="This browser can’t run the match">
        The match runs a small language model on your device. {UNSUPPORTED_REASONS[unsupported]} A
        recent version of Chrome, Edge, Firefox or Safari can run it.
      </EmptyState>
    );
  }
  // The form reads its starting values once, so it waits for the linked application.
  if (resumes.isPending || (linkedId !== null && linked.isPending)) {
    return <Skeleton className="h-96" />;
  }
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
  // A link to an application that's gone (or not yours) starts unlinked instead.
  const formInitial =
    initial && linkedId !== null && linked.isError
      ? { ...initial, application_id: NO_APPLICATION }
      : initial;

  let verdict;
  if (state.status === 'running') {
    verdict = <MatchProgressPanel progress={state.progress} onCancel={run.cancel} />;
  } else if (state.status === 'error') {
    verdict = <Alert title="The match didn’t finish">{state.message}</Alert>;
  } else if (state.status === 'done') {
    verdict = <MatchResult match={state.match} />;
  } else {
    verdict = <VerdictPlaceholder />;
  }

  return (
    <div className="grid gap-14">
      <div className="flex flex-wrap gap-12 border-t-[3px] border-rule pt-7">
        <div className="grid flex-[1_1_22rem] content-start gap-5">
          <MatchForm
            resumes={active}
            applications={withLinked(applications.data?.items, linked.data)}
            running={state.status === 'running'}
            error={state.status === 'error' ? state.error : null}
            onRun={(values) => void onRun(values)}
            initial={formInitial}
          />
          {config.embeddings === 'client' && <OnDeviceNote />}
        </div>
        <div className="grid min-w-0 flex-[999_1_36rem] content-start">{verdict}</div>
      </div>
      <MatchHistory />

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

/** Before the first run: what the verdict column will hold. */
function VerdictPlaceholder() {
  return (
    <section aria-labelledby="verdict-heading" className="grid content-start gap-5">
      <h2 id="verdict-heading" className="kicker">
        The verdict
      </h2>
      <div className="grid gap-3 border-y border-rule py-8">
        {/* An empty slot where the numeral will be: a dash at display size read as a rule. */}
        <p
          aria-hidden="true"
          className="flex items-end gap-2 font-display text-[clamp(6rem,16vw,10.5rem)] leading-[0.8] font-medium text-muted-foreground"
        >
          <span className="h-[0.72em] w-[1.15em] border-2 border-dashed border-input" />
          <span className="text-4xl leading-none">/100</span>
        </p>
        <p className="max-w-prose font-display text-xl leading-snug">
          Your score appears here, with the advert’s lines your resume answers best and the skills
          it doesn’t mention yet.
        </p>
      </div>
    </section>
  );
}

/** Client mode: the texts are embedded in this browser. */
function OnDeviceNote() {
  return (
    <div className="flex gap-3 border bg-muted px-3.5 py-3.5">
      <Monitor aria-hidden="true" className="size-5.5 shrink-0" />
      <p className="text-sm leading-normal">
        <strong>Runs on your device.</strong> Your browser compares the texts with a small language
        model (about {MODEL_DOWNLOAD_MB} MB, downloaded once and kept by the browser). The texts go
        only to JobTrack, never to a third party.
      </p>
    </div>
  );
}

function withLinked(recent: Application[] | undefined, linked: Application | undefined) {
  if (!recent || !linked || recent.some((app) => app.id === linked.id)) return recent;
  return [linked, ...recent];
}

export { MatchPage };

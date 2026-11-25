import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileText,
  Lock,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { LoadError } from '@/components/load-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';
import { formatDateOnly, toDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { isInUse, type Resume, type ResumeSummary } from '@/types/resume';

import { resumeQuery, resumesQuery, useDeleteResume, useUpdateResume } from './api';
import { ResumeFormSheet, type ResumeFormMode } from './resume-form-sheet';
import { duplicateValues } from './resume-schema';
import { usageLabel } from './usage';

const formatCount = (n: number) => n.toLocaleString('en-GB');
/** Tailwind `lg`: list and version side by side from here up. */
const WIDE_LAYOUT = '(min-width: 64rem)';
const formatTimestamp = (iso: string) => formatDateOnly(toDateOnly(new Date(iso)));
const errorText = (error: unknown) => (isApiError(error) ? error.detail : 'Try again in a moment.');

/** The version to show: the one in the URL if it exists, else the default, else the first. */
function pickSelected(resumes: ResumeSummary[], wanted: string | null) {
  return (
    resumes.find((r) => r.id === wanted) ??
    resumes.find((r) => r.is_default) ??
    resumes.find((r) => !r.archived_at) ??
    resumes[0]
  );
}

function VersionList({
  title,
  resumes,
  selectedId,
  onSelect,
}: {
  title: string;
  resumes: ResumeSummary[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const headingId = `versions-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      {/* Group headings borrow the kicker style (CLAUDE.md "All-caps"). */}
      <h2 id={headingId} className="pt-3 kicker text-muted-foreground">
        {title} <span className="figures">({resumes.length})</span>
      </h2>
      <ul className="grid border-t">
        {resumes.map((resume) => {
          const selected = resume.id === selectedId;
          return (
            <li key={resume.id} className="border-b">
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(resume.id)}
                className={cn(
                  'grid w-full gap-1.5 px-3.5 py-4 text-left transition-colors duration-(--duration-fast) hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  // Selected: shaded, with a brand-colour bar on the left.
                  selected && 'bg-accent shadow-[inset_3px_0_0_var(--primary)]',
                )}
              >
                <span className="flex flex-wrap items-center gap-2.5">
                  <span className="min-w-0 truncate font-display text-[1.375rem] leading-tight font-medium">
                    {resume.label}
                  </span>
                  {resume.is_default && <Badge variant="outline">Default</Badge>}
                </span>
                <span className="text-sm text-muted-foreground">{usageLabel(resume)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Actions = {
  onEdit: (resume: Resume) => void;
  onDuplicate: (resume: Resume) => void;
  onDelete: (resume: ResumeSummary) => void;
  /** Keep this version selected (it may stop being the fallback, e.g. once archived). */
  onPin: (id: string) => void;
};

function VersionView({ summary, actions }: { summary: ResumeSummary; actions: Actions }) {
  const resume = useQuery(resumeQuery(summary.id));
  const update = useUpdateResume();
  const used = isInUse(summary);
  const archived = summary.archived_at !== null;

  const patch = (
    change: Parameters<typeof update.mutate>[0]['patch'],
    done: string,
    undo?: () => void,
  ) => {
    // Pin first: once archived (or no longer the default) this version stops being the
    // page's fallback, and the refetched list must not swap it out from under the user.
    actions.onPin(summary.id);
    update.mutate(
      { id: summary.id, patch: change },
      {
        onSuccess: () =>
          toast.success(done, undo ? { action: { label: 'Undo', onClick: undo } } : undefined),
        onError: (error) =>
          toast.error('Couldn’t update this version', { description: errorText(error) }),
      },
    );
  };

  return (
    <article aria-labelledby="version-heading" className="grid content-start gap-5 pt-5">
      <header className="grid gap-3 border-b pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="version-heading"
            className="font-display text-[2.25rem] leading-tight font-semibold"
          >
            {summary.label}
          </h2>
          {summary.is_default && <Badge variant="outline">Default</Badge>}
          {archived && <Badge variant="secondary">Archived</Badge>}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="figures">{formatTimestamp(summary.updated_at)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Length</dt>
            <dd className="figures">{formatCount(summary.char_count)} characters</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="sr-only">Use</dt>
            <dd>{usageLabel(summary)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!resume.data}
            onClick={() => resume.data && actions.onEdit(resume.data)}
          >
            <Pencil /> {used ? 'Rename' : 'Edit'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!resume.data}
            onClick={() => resume.data && actions.onDuplicate(resume.data)}
          >
            <Copy /> Duplicate as new version
          </Button>
          {!archived && !summary.is_default && (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() => patch({ is_default: true }, `${summary.label} is now your default`)}
            >
              <Star /> Make default
            </Button>
          )}
          {archived ? (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() => patch({ archived: false }, `Restored ${summary.label}`)}
            >
              <ArchiveRestore /> Restore
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                patch({ archived: true }, `Archived ${summary.label}`, () =>
                  update.mutate({ id: summary.id, patch: { archived: false } }),
                )
              }
            >
              <Archive /> Archive
            </Button>
          )}
          {!used && (
            <Button variant="outline" size="sm" onClick={() => actions.onDelete(summary)}>
              <Trash2 /> Delete
            </Button>
          )}
        </div>

        {used && (
          <p className="flex items-start gap-2.5 bg-muted px-3.5 py-3 text-sm leading-normal text-foreground">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {usageLabel(summary)}, so its text is locked and it can be archived but not deleted.
          </p>
        )}
        {archived && (
          <p className="text-sm text-muted-foreground">
            Archived versions don’t appear when you pick a resume for an application.
          </p>
        )}
      </header>

      {resume.isPending && (
        <div aria-busy="true" aria-label="Loading the resume text" className="grid gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
      {resume.isError && (
        <LoadError
          title="The text didn’t load"
          error={resume.error}
          onRetry={() => void resume.refetch()}
        />
      )}
      {resume.data && (
        // The text set like a printed page: card stock, hairline edge, an offset shadow.
        <div className="max-w-prose border bg-card px-6 py-8 shadow-[0_1px_0_var(--border),6px_6px_0_var(--muted)] sm:px-12 sm:py-10">
          <p className="font-display text-base leading-relaxed break-words whitespace-pre-wrap">
            {resume.data.content_text}
          </p>
        </div>
      )}
    </article>
  );
}

function ResumesPage() {
  const resumes = useQuery(resumesQuery());
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<ResumeFormMode | null>(null);
  const [deleting, setDeleting] = useState<ResumeSummary | null>(null);
  const remove = useDeleteResume();

  const select = (id: string) =>
    setParams({ version: id }, { replace: true, preventScrollReset: true });
  /** Picked from the list: on narrow screens the version is below the list, so go to it. */
  const open = (id: string) => {
    select(id);
    if (!window.matchMedia(WIDE_LAYOUT).matches) {
      requestAnimationFrame(() =>
        document.getElementById('version-heading')?.scrollIntoView({ block: 'start' }),
      );
    }
  };

  const list = resumes.data ?? [];
  const selected = pickSelected(list, params.get('version'));
  const active = list.filter((r) => !r.archived_at);
  const archived = list.filter((r) => r.archived_at);

  const actions: Actions = {
    onEdit: (resume) => setForm({ type: 'edit', resume }),
    onDuplicate: (resume) => setForm({ type: 'create', initial: duplicateValues(resume) }),
    onPin: select,
    onDelete: (resume) => {
      remove.reset();
      setDeleting(resume);
    },
  };
  const addButton = (
    <Button onClick={() => setForm({ type: 'create' })}>
      <Plus /> Add a version
    </Button>
  );

  let content;
  if (resumes.isPending) {
    content = (
      <div aria-busy="true" aria-label="Loading resume versions" className="mt-8 grid gap-3">
        <Skeleton className="h-16 w-full max-w-80" />
        <Skeleton className="h-16 w-full max-w-80" />
      </div>
    );
  } else if (resumes.isError) {
    content = (
      <LoadError
        title="Resume versions didn’t load"
        className="mt-8"
        error={resumes.error}
        onRetry={() => void resumes.refetch()}
      />
    );
  } else if (!selected) {
    content = (
      <EmptyState
        icon={FileText}
        title="No resume versions yet"
        className="mt-10"
        action={addButton}
      >
        Paste in each version you send. Then you can record which one went with each application,
        and later check one against a job description.
      </EmptyState>
    );
  } else {
    content = (
      <div className="mt-7 grid gap-10 border-t-[3px] border-rule lg:grid-cols-[22rem_minmax(0,1fr)]">
        <nav aria-label="Resume versions" className="grid content-start gap-6">
          {active.length > 0 && (
            <VersionList title="Active" resumes={active} selectedId={selected.id} onSelect={open} />
          )}
          {archived.length > 0 && (
            <VersionList
              title="Archived"
              resumes={archived}
              selectedId={selected.id}
              onSelect={open}
            />
          )}
        </nav>
        <VersionView key={selected.id} summary={selected} actions={actions} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Library"
        title="Resume versions"
        description="Keep each version you send, and see which one went where."
        actions={list.length > 0 ? addButton : undefined}
      />
      {content}

      <ResumeFormSheet
        mode={form}
        onClose={() => setForm(null)}
        onSaved={(resume) => {
          const created = form?.type === 'create';
          setForm(null);
          if (created) {
            select(resume.id);
            toast.success(`Added ${resume.label}`);
          } else {
            toast.success(`Saved ${resume.label}`);
          }
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.label ?? 'this version'}?`}
        description="It hasn’t been sent with any application, so nothing else changes. This can’t be undone."
        confirmLabel="Delete version"
        pending={remove.isPending}
        error={remove.isError ? errorText(remove.error) : null}
        onConfirm={() => {
          if (!deleting) return;
          const { label } = deleting;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setParams({}, { replace: true, preventScrollReset: true });
              toast.success(`Deleted ${label}`);
            },
          });
        }}
      />
    </>
  );
}

export { ResumesPage };

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Pencil } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Loading } from '@/components/loading';
import { PageHeader } from '@/components/page-header';
import { TagChip } from '@/components/tag-chip';
import { LoadError } from '@/components/load-error';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { applicationEventsQuery } from '@/features/calendar/api';
import { remindersQuery } from '@/features/reminders/api';
import { LatestMatchSection } from '@/features/match/latest-match-section';
import { RemindersSection } from '@/features/reminders/reminders-section';
import { resumesQuery } from '@/features/resumes/api';
import { isApiError } from '@/lib/api/errors';
import { daysUntil, formatDateOnly } from '@/lib/dates';
import {
  type Application,
  applicationStatuses,
  statusLabels,
  workModeLabels,
} from '@/types/application';

import { applicationQuery, useDeleteApplication, useUpdateApplication } from './api';
import { ApplicationFormSheet } from './application-form-sheet';
import { ContactsSection } from './contacts-section';
import { StageTrack } from './stage-track';
import { Timeline } from './timeline';

/** Where "back" goes: the list the user came from (with its filters), else the board. */
function useBackTarget(): string {
  const { state } = useLocation() as { state: { from?: unknown } | null };
  const from = state?.from;
  return typeof from === 'string' && /^\/applications(\?|$)/.test(from) ? from : '/applications';
}

function formatMoney(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency ?? 'GBP',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('en-GB')} ${currency ?? ''}`.trim(); // unknown currency code
  }
}

function salaryText({ salary_min: min, salary_max: max, salary_currency: cur }: Application) {
  if (min !== null && max !== null && min !== max) {
    return `${formatMoney(min, cur)} to ${formatMoney(max, cur)}`;
  }
  if (min !== null) return max === null ? `From ${formatMoney(min, cur)}` : formatMoney(min, cur);
  if (max !== null) return `Up to ${formatMoney(max, cur)}`;
  return null;
}

/** How long until (or since) the apply-by date. Shown only while on the wishlist: once
 * applied, the date is history. */
function applyByHint(deadline: string): string {
  const days = daysUntil(deadline);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return days === -1 ? 'yesterday' : `${-days} days ago`;
}

/** The version sent, linking to it on the Resumes page. */
function ResumeSent({ id }: { id: string }) {
  const resumes = useQuery(resumesQuery());
  if (resumes.isPending) {
    return (
      <Loading label="Loading the resume version">
        <Skeleton className="h-4 w-40" />
      </Loading>
    );
  }
  const resume = resumes.data?.find((r) => r.id === id);
  if (!resume) return <span className="text-muted-foreground">Unavailable</span>;
  return (
    <Link
      to={`/resumes?version=${resume.id}`}
      className="text-primary-text underline-offset-4 hover:underline"
    >
      {resume.label}
      {resume.archived_at && (
        <>
          {' '}
          <span className="text-muted-foreground">(archived)</span>
        </>
      )}
    </Link>
  );
}

function Details({ application: a }: { application: Application }) {
  const salary = salaryText(a);
  const rows: [string, ReactNode][] = [
    [
      'Location',
      [a.location, a.work_mode && workModeLabels[a.work_mode]].filter(Boolean).join(', '),
    ],
    ['Salary', salary && <span className="font-mono">{salary}</span>],
    ['Source', a.source],
    [
      'Applied',
      a.applied_on && (
        <time dateTime={a.applied_on} className="font-mono">
          {formatDateOnly(a.applied_on)}
        </time>
      ),
    ],
    [
      'Apply by',
      a.deadline_on && (
        <>
          <time dateTime={a.deadline_on} className="font-mono">
            {formatDateOnly(a.deadline_on)}
          </time>
          {a.status === 'wishlist' && (
            <span className="text-muted-foreground"> ({applyByHint(a.deadline_on)})</span>
          )}
        </>
      ),
    ],
    [
      'Job link',
      a.job_url && (
        <a
          href={a.job_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary-text underline-offset-4 hover:underline"
        >
          View the job ad
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ),
    ],
    ['Resume', a.resume_version_id && <ResumeSent id={a.resume_version_id} />],
    [
      'Tags',
      a.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Tags">
          {a.tags.map((tag) => (
            <li key={tag.id}>
              <TagChip name={tag.name} color={tag.color} />
            </li>
          ))}
        </ul>
      ),
    ],
  ];

  return (
    <section aria-labelledby="details-heading" className="grid gap-1">
      <h2
        id="details-heading"
        className="border-b border-rule pb-2 kicker text-[0.8125rem] font-bold text-foreground"
      >
        Details
      </h2>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="col-span-2 grid grid-cols-subgrid border-b py-2.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">
              {value || <span className="text-muted-foreground">Not set</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function StatusPicker({ application }: { application: Application }) {
  const update = useUpdateApplication(application.id);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="detail-status" className="text-sm font-semibold">
        Status
      </label>
      <Select
        value={application.status}
        disabled={update.isPending}
        onValueChange={(value) => {
          const status = applicationStatuses.find((s) => s === value);
          if (!status || status === application.status) return;
          update.mutate(
            { status },
            {
              onError: (error) =>
                toast.error('Couldn’t change the status', {
                  description: isApiError(error) ? error.detail : 'Try again in a moment.',
                }),
            },
          );
        }}
      >
        <SelectTrigger id="detail-status" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {applicationStatuses.map((status) => (
            <SelectItem key={status} value={status}>
              {statusLabels[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What else goes with the application (the server deletes its reminders and events too). */
function DeleteWarning({ applicationId }: { applicationId: string }) {
  const reminders = useQuery(remindersQuery({ status: 'all', application_id: applicationId }));
  const events = useQuery(applicationEventsQuery(applicationId));
  const extras = [
    reminders.data?.length ? count(reminders.data.length, 'follow-up', 'follow-ups') : null,
    events.data?.length ? count(events.data.length, 'calendar event', 'calendar events') : null,
  ].filter(Boolean);
  const also = extras.length ? `, along with ${extras.join(' and ')}` : '';
  return <>Its timeline, notes and contacts are deleted too{also}. This can’t be undone.</>;
}

function ApplicationView({ application, back }: { application: Application; back: string }) {
  const navigate = useNavigate();
  const remove = useDeleteApplication();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const where = [
    application.location,
    application.work_mode && workModeLabels[application.work_mode],
  ]
    .filter(Boolean)
    .join(', ');

  const deleteApplication = () =>
    remove.mutate(application.id, {
      onSuccess: () => {
        void navigate(back, { replace: true });
        toast.success(`Deleted ${application.company}`, {
          description: application.role_title,
        });
      },
    });

  return (
    <>
      <PageHeader
        kicker="Application"
        title={application.company}
        description={
          <>
            <span className="font-display text-[1.375rem] text-foreground">
              {application.role_title}
            </span>
            {/* Phones: the location gets its own line (a trailing "·" read as a stray). */}
            {where && (
              <>
                <span className="hidden sm:inline"> · </span>{' '}
                <span className="block sm:inline">{where}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <StatusPicker application={application} />
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          </>
        }
        className="border-b-[3px] border-rule pb-6"
      />
      <StageTrack application={application} />

      <div className="mt-9 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <Timeline applicationId={application.id} />
        <aside className="grid content-start gap-8" aria-label="About this application">
          <Details application={application} />
          <LatestMatchSection applicationId={application.id} />
          <RemindersSection applicationId={application.id} company={application.company} />
          <ContactsSection applicationId={application.id} />
          <Button
            variant="link"
            className="justify-self-start text-destructive"
            onClick={() => {
              remove.reset();
              setConfirmDelete(true);
            }}
          >
            Delete this application…
          </Button>
        </aside>
      </div>

      <ApplicationFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        mode={{ type: 'edit', application }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${application.company}?`}
        description={<DeleteWarning applicationId={application.id} />}
        confirmLabel="Delete application"
        pending={remove.isPending}
        error={
          remove.isError
            ? isApiError(remove.error)
              ? remove.error.detail
              : 'Couldn’t delete it. Try again.'
            : null
        }
        onConfirm={deleteApplication}
      />
    </>
  );
}

function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const back = useBackTarget();
  const application = useQuery(applicationQuery(id));
  const notFound = isApiError(application.error) && application.error.status === 404;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link to={back} className="link">
          Applications
        </Link>
        {application.data && (
          <>
            {' '}
            <span aria-hidden="true" className="text-subtle-foreground">
              /
            </span>{' '}
            <span aria-current="page" className="text-muted-foreground">
              {application.data.company}
            </span>
          </>
        )}
      </nav>
      {application.isPending && (
        <Loading label="Loading the application" className="grid gap-3">
          <Skeleton className="h-14 w-72" />
          <Skeleton className="h-6 w-56" />
        </Loading>
      )}
      {application.isError && (
        <>
          <PageHeader title={notFound ? 'Application not found' : 'This application didn’t load'} />
          {notFound ? (
            <Alert className="mt-6 max-w-xl">It may have been deleted, or the link is wrong.</Alert>
          ) : (
            <LoadError
              className="mt-6"
              error={application.error}
              onRetry={() => void application.refetch()}
            />
          )}
        </>
      )}
      {application.data && <ApplicationView application={application.data} back={back} />}
    </>
  );
}

export { ApplicationDetailPage };

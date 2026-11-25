import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadError } from '@/components/load-error';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';
import type { Reminder } from '@/types/reminder';

import { remindersQuery, useDeleteReminder } from './api';
import { compareDue } from './due';
import { ReminderFormDialog, type ReminderFormMode } from './reminder-form-dialog';
import { ReminderItem } from './reminder-item';
import { useToggleDone } from './use-toggle-done';

const errorText = (error: unknown) => (isApiError(error) ? error.detail : 'Try again in a moment.');

/** Follow-ups for one application, on its detail page: open ones in due order, done ones
 * behind a toggle. */
function RemindersSection({ applicationId, company }: { applicationId: string; company: string }) {
  const reminders = useQuery(remindersQuery({ status: 'all', application_id: applicationId }));
  const remove = useDeleteReminder();
  const { toggle, pendingId } = useToggleDone();
  const [form, setForm] = useState<ReminderFormMode | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const [showDone, setShowDone] = useState(false);
  const now = new Date();

  const item = (reminder: Reminder) => (
    <ReminderItem
      key={reminder.id}
      reminder={reminder}
      now={now}
      pending={pendingId === reminder.id}
      onToggleDone={(r) => toggle(r)}
      onEdit={(r) => setForm({ type: 'edit', reminder: r })}
      onDelete={(r) => {
        remove.reset();
        setDeleting(r);
      }}
    />
  );

  let content;
  if (reminders.isPending) {
    content = (
      <Loading label="Loading follow-ups">
        <Skeleton className="h-12 w-full" />
      </Loading>
    );
  } else if (reminders.isError) {
    content = (
      <LoadError
        title="Follow-ups didn’t load"
        error={reminders.error}
        onRetry={() => void reminders.refetch()}
      />
    );
  } else {
    const open = reminders.data.filter((r) => !r.done_at).sort((a, b) => compareDue(a, b));
    const done = reminders.data.filter((r) => r.done_at);
    content = (
      <>
        {open.length > 0 ? (
          <ul aria-label="Open follow-ups">{open.map(item)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing to follow up. Add a reminder so this application doesn’t go quiet.
          </p>
        )}
        {done.length > 0 && (
          <div className="grid gap-2">
            <Button
              variant="link"
              size="sm"
              className="w-fit px-0"
              aria-expanded={showDone}
              onClick={() => setShowDone((v) => !v)}
            >
              {showDone ? 'Hide done' : `Show done (${done.length})`}
            </Button>
            {showDone && <ul aria-label="Done follow-ups">{done.map(item)}</ul>}
          </div>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="followups-heading" className="grid gap-3">
      <div className="flex items-center justify-between gap-2 border-b border-rule pb-1">
        <h2 id="followups-heading" className="kicker text-[0.8125rem] font-bold text-foreground">
          Follow-ups
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setForm({ type: 'create', applicationId, company })}
        >
          <Plus /> Add follow-up
        </Button>
      </div>
      {content}

      <ReminderFormDialog mode={form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this follow-up?"
        description={deleting ? `“${deleting.title}” is removed. This can’t be undone.` : ''}
        confirmLabel="Delete follow-up"
        pending={remove.isPending}
        error={remove.isError ? errorText(remove.error) : null}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </section>
  );
}

export { RemindersSection };

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import { ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { LoadError } from '@/components/load-error';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Loading } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { applyServerError } from '@/features/auth/form-errors';
import { useFormAlert } from '@/features/auth/use-form-alert';
import { cn } from '@/lib/utils';
import { type ApplicationEvent, statusLabels } from '@/types/application';

import { eventsQuery, useAddNote } from './api';

const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a note first')
    .max(5000, 'Keep notes under 5000 characters'),
});
type NoteValues = z.input<typeof noteSchema>;

function NoteForm({ applicationId }: { applicationId: string }) {
  const addNote = useAddNote(applicationId);
  const alert = useFormAlert();
  const form = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { body: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ body }) => {
    alert.clear();
    try {
      await addNote.mutateAsync(body.trim());
      form.reset();
    } catch (error) {
      alert.showOutcome(applyServerError(error, form.setError, ['body']));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-3">
      {alert.message && <Alert>{alert.message}</Alert>}
      <FormField
        label="Add a note"
        description="Interview prep, who you spoke to, what to follow up on."
        error={errors.body?.message}
      >
        <Textarea
          rows={3}
          className="min-h-20"
          {...form.register('body')}
          onKeyDown={(event) => {
            // Ctrl/⌘+Enter saves, as in most note boxes.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void onSubmit();
          }}
        />
      </FormField>
      <Button type="submit" className="justify-self-end" disabled={isSubmitting || alert.isWaiting}>
        {isSubmitting ? 'Saving…' : 'Add note'}
      </Button>
    </form>
  );
}

const timestamp = (iso: string) => format(parseISO(iso), 'd MMM yyyy, HH:mm');

function EventItem({ event }: { event: ApplicationEvent }) {
  const isNote = event.type === 'note';
  return (
    <li className="relative grid gap-x-4 gap-y-1 pb-6 pl-5.5 last:pb-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      {/* A square on the list's ink rule: brand colour for status changes, ink for notes. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1 -left-[7px] size-3 border-2 border-background',
          isNote ? 'bg-foreground' : 'bg-primary',
        )}
      />
      <time
        dateTime={event.created_at}
        className="pt-0.5 figures text-[0.8125rem] text-muted-foreground"
      >
        {timestamp(event.created_at)}
      </time>
      <div className="grid min-w-0 gap-1">
        <span className="kicker text-muted-foreground">{isNote ? 'Note' : 'Status'}</span>
        <EventText event={event} />
      </div>
    </li>
  );
}

function EventText({ event }: { event: ApplicationEvent }) {
  return event.type === 'note' ? (
    <p className="font-display text-[1.0625rem] leading-normal whitespace-pre-wrap">{event.body}</p>
  ) : event.from_status && event.to_status ? (
    <p className="flex flex-wrap items-center gap-1.5 text-sm">
      Moved from <strong className="font-semibold">{statusLabels[event.from_status]}</strong>
      <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <span className="sr-only">to</span>
      <strong className="font-semibold">{statusLabels[event.to_status]}</strong>
    </p>
  ) : (
    <p className="text-sm">
      Added to{' '}
      <strong className="font-semibold">
        {event.to_status ? statusLabels[event.to_status] : 'the pipeline'}
      </strong>
    </p>
  );
}

/** Status history and notes, newest first, with a box to add a note. */
function Timeline({ applicationId }: { applicationId: string }) {
  const events = useQuery(eventsQuery(applicationId));

  return (
    <section aria-labelledby="timeline-heading" className="grid content-start gap-5">
      <h2
        id="timeline-heading"
        className="border-b border-rule pb-2.5 font-display text-[1.875rem] font-semibold"
      >
        Timeline
      </h2>
      <NoteForm applicationId={applicationId} />
      {events.isPending ? (
        <Loading label="Loading the timeline" className="grid gap-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
        </Loading>
      ) : events.isError ? (
        <LoadError
          title="The timeline didn’t load"
          error={events.error}
          onRetry={() => void events.refetch()}
        />
      ) : (
        <ol aria-label="History, newest first" className="ml-[5px] border-l-2 border-rule pt-1">
          {events.data.map((event) => (
            <EventItem key={event.id} event={event} />
          ))}
        </ol>
      )}
    </section>
  );
}

export { Timeline };

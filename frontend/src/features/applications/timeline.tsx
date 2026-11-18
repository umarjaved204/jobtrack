import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { applyServerError } from '@/features/auth/form-errors';
import { useFormAlert } from '@/features/auth/use-form-alert';
import { isApiError } from '@/lib/api/errors';
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
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start"
        disabled={isSubmitting || alert.isWaiting}
      >
        {isSubmitting ? 'Saving…' : 'Add note'}
      </Button>
    </form>
  );
}

const timestamp = (iso: string) => format(parseISO(iso), 'd MMM yyyy, HH:mm');

function EventItem({ event }: { event: ApplicationEvent }) {
  const isNote = event.type === 'note';
  return (
    <li className="group relative grid gap-1 pb-6 pl-6 last:pb-0">
      {/* The rule and marker: a dot for status changes, a square for notes. */}
      <span
        aria-hidden="true"
        className="absolute top-1.5 bottom-0 left-[3px] w-px bg-rule group-last:hidden"
      />
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1.5 left-0 size-[7px]',
          isNote ? 'bg-foreground' : 'rounded-full bg-primary',
        )}
      />
      <time dateTime={event.created_at} className="font-mono text-xs text-muted-foreground">
        {timestamp(event.created_at)}
      </time>
      {isNote ? (
        <p className="rounded-md bg-card px-3 py-2 text-sm whitespace-pre-wrap shadow-xs">
          {event.body}
        </p>
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
      )}
    </li>
  );
}

/** Status history and notes, newest first, with a box to add a note. */
function Timeline({ applicationId }: { applicationId: string }) {
  const events = useQuery(eventsQuery(applicationId));

  return (
    <section aria-labelledby="timeline-heading" className="grid gap-5">
      <h2 id="timeline-heading" className="font-display text-2xl font-semibold">
        Timeline
      </h2>
      <NoteForm applicationId={applicationId} />
      {events.isPending ? (
        <div aria-busy="true" aria-label="Loading the timeline" className="grid gap-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
        </div>
      ) : events.isError ? (
        <Alert title="The timeline didn’t load">
          <p>{isApiError(events.error) ? events.error.detail : 'Something went wrong.'}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void events.refetch()}
          >
            <RotateCcw /> Try again
          </Button>
        </Alert>
      ) : (
        <ol aria-label="History, newest first" className="border-t pt-5">
          {events.data.map((event) => (
            <EventItem key={event.id} event={event} />
          ))}
        </ol>
      )}
    </section>
  );
}

export { Timeline };

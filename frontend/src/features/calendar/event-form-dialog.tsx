import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { boardQuery } from '@/features/applications/api';
import { applyServerError } from '@/features/auth/form-errors';
import { useFormAlert } from '@/features/auth/use-form-alert';
import { type CalendarEvent, eventKindHints, eventKindLabels, eventKinds } from '@/types/calendar';

import { useCreateEvent, useUpdateEvent } from './api';
import {
  eventFields,
  eventFormSchema,
  type EventFormValues,
  eventFormValues,
  NO_APPLICATION,
  newEventValues,
  toEventInput,
  toEventPatch,
} from './event-schema';

export type EventFormMode =
  { type: 'create'; day: string; applicationId?: string } | { type: 'edit'; event: CalendarEvent };

type EventFormDialogProps = {
  mode: EventFormMode | null;
  onClose: () => void;
  onSaved?: (event: CalendarEvent) => void;
};

/** Add or edit an interview, assessment, deadline or other event. Times are local. */
function EventFormDialog({ mode, onClose, onSaved }: EventFormDialogProps) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode?.type === 'edit' ? `Edit ${mode.event.title}` : 'Add an event'}
          </DialogTitle>
          <DialogDescription>Times are in your time zone.</DialogDescription>
        </DialogHeader>
        {mode && (
          <EventForm
            key={mode.type === 'edit' ? mode.event.id : `new-${mode.day}`}
            mode={mode}
            onCancel={onClose}
            onSaved={(event) => {
              onSaved?.(event);
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventForm({
  mode,
  onCancel,
  onSaved,
}: {
  mode: EventFormMode;
  onCancel: () => void;
  onSaved: (event: CalendarEvent) => void;
}) {
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const alert = useFormAlert();
  const board = useQuery(boardQuery());
  const applications = (board.data?.columns ?? [])
    .flatMap((column) => column.applications)
    .sort((a, b) => a.company.localeCompare(b.company));
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues:
      mode.type === 'edit'
        ? eventFormValues(mode.event)
        : newEventValues(mode.day, mode.applicationId),
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  const kind = useWatch({ control: form.control, name: 'kind' });
  const field = (name: keyof EventFormValues) => ({ error: errors[name]?.message });

  const onSubmit = form.handleSubmit(async (values) => {
    alert.clear();
    try {
      if (mode.type === 'create') {
        onSaved(await create.mutateAsync(toEventInput(values)));
        return;
      }
      const patch = toEventPatch(values, dirtyFields);
      onSaved(
        Object.keys(patch).length
          ? await update.mutateAsync({ id: mode.event.id, patch })
          : mode.event,
      );
    } catch (error) {
      alert.showOutcome(applyServerError(error, form.setError, eventFields));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-4">
      {alert.message && <Alert>{alert.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <FormField label="Kind" description={eventKindHints[kind]} {...field('kind')}>
          {(control) => (
            <Controller
              control={form.control}
              name="kind"
              render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange}>
                  <SelectTrigger {...control} onBlur={f.onBlur} ref={f.ref}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventKinds.map((k) => (
                      <SelectItem key={k} value={k}>
                        {eventKindLabels[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>
        <FormField label="Title" {...field('title')}>
          <Input autoComplete="off" placeholder="Technical interview" {...form.register('title')} />
        </FormField>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Starts</legend>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start date" {...field('start_date')}>
            <Input type="date" {...form.register('start_date')} />
          </FormField>
          <FormField label="Start time" {...field('start_time')}>
            <Input type="time" {...form.register('start_time')} />
          </FormField>
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Ends (optional)</legend>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="End date"
            description="Only if it ends on another day."
            {...field('end_date')}
          >
            <Input type="date" {...form.register('end_date')} />
          </FormField>
          <FormField label="End time" {...field('end_time')}>
            <Input type="time" {...form.register('end_time')} />
          </FormField>
        </div>
      </fieldset>

      <FormField
        label="Location or link"
        description="An address, a room, or a video-call link."
        {...field('location_or_link')}
      >
        <Input autoComplete="off" {...form.register('location_or_link')} />
      </FormField>
      <FormField label="Application" {...field('application_id')}>
        {(control) => (
          <Controller
            control={form.control}
            name="application_id"
            render={({ field: f }) => (
              <Select value={f.value} onValueChange={f.onChange} disabled={board.isPending}>
                <SelectTrigger {...control} onBlur={f.onBlur} ref={f.ref}>
                  <SelectValue
                    placeholder={board.isPending ? 'Loading applications…' : undefined}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_APPLICATION}>None</SelectItem>
                  {applications.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.company}
                      <span className="text-muted-foreground">, {a.role_title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || alert.isWaiting}>
          {isSubmitting ? 'Saving…' : mode.type === 'create' ? 'Add event' : 'Save event'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export { EventFormDialog };

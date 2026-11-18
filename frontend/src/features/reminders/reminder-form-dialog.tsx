import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

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
import { applyServerError } from '@/features/auth/form-errors';
import { useFormAlert } from '@/features/auth/use-form-alert';
import { todayDateOnly } from '@/lib/dates';
import type { Reminder } from '@/types/reminder';

import { useCreateReminder, useUpdateReminder } from './api';
import {
  newReminderValues,
  reminderFields,
  reminderFormSchema,
  type ReminderFormValues,
  reminderFormValues,
  toReminderInput,
  toReminderPatch,
} from './reminder-schema';

export type ReminderFormMode =
  | { type: 'create'; applicationId: string | null; company?: string; date?: string }
  | { type: 'edit'; reminder: Reminder };

type ReminderFormDialogProps = {
  mode: ReminderFormMode | null;
  onClose: () => void;
  onSaved?: (reminder: Reminder) => void;
};

/** Add or edit a follow-up. Times are in the browser's zone; no time = all day. */
function ReminderFormDialog({ mode, onClose, onSaved }: ReminderFormDialogProps) {
  const title =
    mode?.type === 'edit'
      ? 'Edit follow-up'
      : mode?.company
        ? `Add a follow-up for ${mode.company}`
        : 'Add a follow-up';
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Shown here and on your dashboard when it’s due. JobTrack doesn’t send emails or
            notifications.
          </DialogDescription>
        </DialogHeader>
        {mode && (
          <ReminderForm
            key={mode.type === 'edit' ? mode.reminder.id : 'new'}
            mode={mode}
            onCancel={onClose}
            onSaved={(reminder) => {
              onSaved?.(reminder);
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReminderForm({
  mode,
  onCancel,
  onSaved,
}: {
  mode: ReminderFormMode;
  onCancel: () => void;
  onSaved: (reminder: Reminder) => void;
}) {
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const alert = useFormAlert();
  const form = useForm<ReminderFormValues>({
    resolver: zodResolver(reminderFormSchema),
    defaultValues:
      mode.type === 'edit'
        ? reminderFormValues(mode.reminder)
        : mode.date // opened from a calendar day
          ? { title: '', date: mode.date, time: '' }
          : newReminderValues(todayDateOnly()),
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    alert.clear();
    try {
      if (mode.type === 'create') {
        onSaved(await create.mutateAsync(toReminderInput(values, mode.applicationId)));
        return;
      }
      const patch = toReminderPatch(values, dirtyFields);
      onSaved(
        Object.keys(patch).length
          ? await update.mutateAsync({ id: mode.reminder.id, patch })
          : mode.reminder,
      );
    } catch (error) {
      alert.showOutcome(applyServerError(error, form.setError, [...reminderFields]));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-4">
      {alert.message && <Alert>{alert.message}</Alert>}
      <FormField label="What to do" error={errors.title?.message}>
        <Input
          autoComplete="off"
          placeholder="Chase the recruiter for feedback"
          {...form.register('title')}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Date" error={errors.date?.message}>
          <Input type="date" {...form.register('date')} />
        </FormField>
        <FormField
          label="Time"
          description="Optional. Leave it empty for all day."
          error={errors.time?.message}
        >
          <Input type="time" {...form.register('time')} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || alert.isWaiting}>
          {isSubmitting ? 'Saving…' : mode.type === 'create' ? 'Add follow-up' : 'Save follow-up'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export { ReminderFormDialog };

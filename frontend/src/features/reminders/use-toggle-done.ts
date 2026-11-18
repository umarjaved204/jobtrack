import { toast } from 'sonner';

import { isApiError } from '@/lib/api/errors';
import type { Reminder } from '@/types/reminder';

import { useUpdateReminder } from './api';

/** Marks a reminder done (or reopens it) with a toast that can undo it. Shared by every
 * reminder list (an application's follow-ups, "Coming up", the calendar). */
export function useToggleDone() {
  const update = useUpdateReminder();
  const toggle = (reminder: Reminder, done = !reminder.done_at): void =>
    update.mutate(
      { id: reminder.id, patch: { done } },
      {
        onSuccess: () =>
          toast.success(done ? 'Marked as done' : 'Reopened', {
            description: reminder.title,
            action: { label: 'Undo', onClick: () => toggle(reminder, !done) },
          }),
        onError: (error) =>
          toast.error('Couldn’t update the follow-up', {
            description: isApiError(error) ? error.detail : 'Try again in a moment.',
          }),
      },
    );
  return { toggle, pendingId: update.isPending ? update.variables.id : null };
}

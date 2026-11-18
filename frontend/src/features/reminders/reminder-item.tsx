import { CircleAlert, Pencil, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { Reminder } from '@/types/reminder';

import { dueLabel, dueState, localDay } from './due';

type ReminderItemProps = {
  reminder: Reminder;
  now: Date;
  onToggleDone: (reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  /** Show which application it's for (lists that mix applications). */
  showApplication?: boolean;
  pending?: boolean;
};

/**
 * One follow-up: a checkbox to mark it done (its label is the title), when it's due, and
 * edit/delete. Overdue is said in words with an icon, not by colour alone.
 */
function ReminderItem({
  reminder,
  now,
  onToggleDone,
  onEdit,
  onDelete,
  showApplication = false,
  pending = false,
}: ReminderItemProps) {
  const id = useId();
  const state = dueState(reminder, now);
  const done = state === 'done';

  return (
    <li className="flex items-start gap-3 border-b py-3 first:pt-0 last:border-b-0">
      <Checkbox
        id={id}
        checked={done}
        disabled={pending}
        onCheckedChange={() => onToggleDone(reminder)}
        aria-describedby={`${id}-due`}
        className="mt-1"
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <label
          htmlFor={id}
          className={cn(
            'cursor-pointer font-medium break-words',
            done && 'text-muted-foreground line-through',
          )}
        >
          {reminder.title}
        </label>
        <p
          id={`${id}-due`}
          className={cn(
            'flex items-center gap-1 text-sm',
            state === 'overdue' ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {state === 'overdue' && <CircleAlert aria-hidden="true" className="size-3.5" />}
          {done && reminder.done_at
            ? `Done ${formatDateOnly(localDay(reminder.done_at))}`
            : `${state === 'overdue' ? 'Overdue: ' : ''}${dueLabel(reminder, now)}`}
        </p>
        {showApplication && reminder.application && (
          <Link
            to={`/applications/${reminder.application.id}`}
            className="w-fit text-sm text-primary-text underline-offset-4 hover:underline"
          >
            {reminder.application.company}
          </Link>
        )}
      </div>
      <div className="-mt-1 -mr-2 flex shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit “${reminder.title}”`}
          onClick={() => onEdit(reminder)}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete “${reminder.title}”`}
          onClick={() => onDelete(reminder)}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export { ReminderItem };

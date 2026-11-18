import { CalendarClock, ExternalLink, MapPin, Pencil, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReminderItem as ReminderRow } from '@/features/reminders/reminder-item';
import type { CalendarEvent, CalendarItem, EventItem } from '@/types/calendar';
import { eventKindLabels } from '@/types/calendar';
import type { Reminder } from '@/types/reminder';

import { linkHref } from './event-schema';
import { asReminder, itemTimeText } from './month';

export type DayItemHandlers = {
  now: Date;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (event: CalendarEvent) => void;
  onToggleReminder: (reminder: Reminder) => void;
  onEditReminder: (reminder: Reminder) => void;
  onDeleteReminder: (reminder: Reminder) => void;
  pendingReminderId?: string | null;
};

function Location({ value }: { value: string }) {
  const href = linkHref(value);
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1 text-primary-text underline-offset-4 hover:underline"
        >
          <span className="truncate">{value}</span>
          <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : (
        <span className="break-words">{value}</span>
      )}
    </p>
  );
}

function EventRow({ item, handlers }: { item: EventItem; handlers: DayItemHandlers }) {
  return (
    <li className="flex items-start gap-3 border-b py-3 first:pt-0 last:border-b-0">
      <CalendarClock aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary-text" />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{item.title}</span>
          <Badge variant="outline">{eventKindLabels[item.kind]}</Badge>
        </p>
        <p className="font-mono text-sm">{itemTimeText(item)}</p>
        {item.location_or_link && <Location value={item.location_or_link} />}
        {item.application && (
          <Link
            to={`/applications/${item.application.id}`}
            className="w-fit text-sm text-primary-text underline-offset-4 hover:underline"
          >
            {item.application.company}
          </Link>
        )}
      </div>
      <div className="-mt-1 -mr-2 flex shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${item.title}`}
          onClick={() => handlers.onEditEvent(item)}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${item.title}`}
          onClick={() => handlers.onDeleteEvent(item)}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

/** One day's events, apply-by dates and reminders, with their actions. */
function DayItems({
  items,
  handlers,
  label,
}: {
  items: CalendarItem[];
  handlers: DayItemHandlers;
  label: string;
}) {
  return (
    <ul aria-label={label}>
      {items.map((item) => {
        if (item.type === 'event') {
          return <EventRow key={`e-${item.id}`} item={item} handlers={handlers} />;
        }
        if (item.type === 'apply_by') {
          return (
            <li
              key={`a-${item.id}`}
              className="flex items-start gap-3 border-b py-3 first:pt-0 last:border-b-0"
            >
              <Send aria-hidden="true" className="mt-1 size-4 shrink-0 text-cobalt" />
              <div className="grid gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/applications/${item.application.id}`}
                    className="font-medium text-primary-text underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                  <Badge variant="outline">Apply by</Badge>
                </p>
                <p className="text-sm text-muted-foreground">{item.application.role_title}</p>
              </div>
            </li>
          );
        }
        return (
          <ReminderRow
            key={`r-${item.id}`}
            reminder={asReminder(item)}
            now={handlers.now}
            showApplication
            pending={handlers.pendingReminderId === item.id}
            onToggleDone={handlers.onToggleReminder}
            onEdit={handlers.onEditReminder}
            onDelete={handlers.onDeleteReminder}
          />
        );
      })}
    </ul>
  );
}

export { DayItems };

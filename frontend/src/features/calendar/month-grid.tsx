import { Bell, CalendarClock, Send } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { localDay, localTime } from '@/features/reminders/due';
import { formatDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { DateOnly } from '@/types/application';
import type { CalendarItem } from '@/types/calendar';

import { type Month, moveFocus } from './month';

const WEEKDAYS = [
  ['Mon', 'Monday'],
  ['Tue', 'Tuesday'],
  ['Wed', 'Wednesday'],
  ['Thu', 'Thursday'],
  ['Fri', 'Friday'],
  ['Sat', 'Saturday'],
  ['Sun', 'Sunday'],
] as const;
const VISIBLE_ITEMS = 3;

const TYPE_STYLE = {
  event: { icon: CalendarClock, className: 'bg-primary-tint' },
  apply_by: { icon: Send, className: 'bg-cobalt-tint' },
  reminder: { icon: Bell, className: 'bg-stone-tint' },
} as const;

/** On the days after a multi-day event starts, its chip shows no time (it didn't start then). */
function Chip({ item, day }: { item: CalendarItem; day: DateOnly }) {
  const { icon: Icon, className } = TYPE_STYLE[item.type];
  const starts = item.type === 'apply_by' ? null : item.starts_at;
  const start = starts && localDay(starts) === day ? starts : null;
  return (
    <li className={cn('flex min-w-0 items-center gap-1 px-1 py-0.5 text-xs', className)}>
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      {start && <span className="shrink-0 font-mono">{localTime(start)}</span>}
      <span className={cn('truncate', item.type === 'reminder' && item.done_at && 'line-through')}>
        {item.title}
      </span>
    </li>
  );
}

type MonthGridProps = {
  month: Month;
  weeks: DateOnly[][];
  today: DateOnly;
  selected: DateOnly;
  items: Map<DateOnly, CalendarItem[]>;
  /** Keyboard focus crossed into another month. */
  onMonthChange: (month: Month, focusDay: DateOnly) => void;
  /** Click, Enter or Space on a day. */
  onOpenDay: (day: DateOnly) => void;
  labelledBy: string;
};

/**
 * The month as a WAI-ARIA grid (APG date grid): one day is in the tab order (roving
 * tabindex). Arrows move by day and week, Home/End to the start/end of the week,
 * PageUp/PageDown by month (crossing into the next month as needed); Enter or Space
 * opens the day. Each day's name says how many items it has; the chips are visual.
 */
function MonthGrid({
  month,
  weeks,
  today,
  selected,
  items,
  onMonthChange,
  onOpenDay,
  labelledBy,
}: MonthGridProps) {
  const days = weeks.flat();
  const [focusDay, setFocusDay] = useState<DateOnly>(selected);
  const active = days.includes(focusDay)
    ? focusDay
    : days.includes(selected)
      ? selected
      : `${month}-01`;
  const cells = useRef(new Map<DateOnly, HTMLTableCellElement>());
  const moveFocusPending = useRef(false);

  // After a keyboard move (possibly into another month, which re-renders the grid),
  // put focus on the new day.
  useEffect(() => {
    // Wait until the target day is rendered: crossing into another month takes a render
    // (the URL updates) before its days exist.
    if (!moveFocusPending.current || active !== focusDay) return;
    moveFocusPending.current = false;
    cells.current.get(active)?.focus();
  }, [active, focusDay, month]);

  const onKeyDown = (event: KeyboardEvent, day: DateOnly) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenDay(day);
      return;
    }
    const next = moveFocus(day, event.key);
    if (!next) return;
    event.preventDefault();
    moveFocusPending.current = true;
    setFocusDay(next);
    if (next.slice(0, 7) !== month && !days.includes(next)) {
      onMonthChange(next.slice(0, 7), next);
    } else if (next === day) {
      moveFocusPending.current = false; // Home on a Monday: nothing moves
    }
  };

  return (
    <table
      role="grid"
      aria-labelledby={labelledBy}
      className="w-full table-fixed border-collapse border-t-[3px] border-rule"
    >
      <thead>
        <tr>
          {WEEKDAYS.map(([short, long]) => (
            <th
              key={short}
              scope="col"
              abbr={long}
              // Weekday headers borrow the kicker style (CLAUDE.md "All-caps").
              className="border-r border-b border-r-border border-b-rule px-2.5 py-2 text-left kicker font-bold text-muted-foreground last:border-r-0"
            >
              {short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const dayItems = items.get(day) ?? [];
              const inMonth = day.slice(0, 7) === month;
              const isToday = day === today;
              const count = dayItems.length;
              return (
                <td
                  key={day}
                  ref={(cell) => {
                    if (cell) cells.current.set(day, cell);
                    else cells.current.delete(day);
                  }}
                  role="gridcell"
                  tabIndex={day === active ? 0 : -1}
                  aria-selected={day === selected}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => {
                    setFocusDay(day);
                    onOpenDay(day);
                  }}
                  onKeyDown={(event) => onKeyDown(event, day)}
                  className={cn(
                    'h-28 cursor-pointer border-r border-b p-2 align-top last:border-r-0',
                    'transition-colors duration-(--duration-fast) hover:bg-accent',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    // Selected: shaded and outlined in ink (focus keeps the cobalt ring).
                    day === selected && 'bg-accent shadow-[inset_0_0_0_2px_var(--rule)]',
                    !inMonth && 'text-muted-foreground',
                  )}
                >
                  {/* The cell's name comes from its text, with the visible day number in
                      it (voice control users say what they see): "Tuesday 10 November,
                      1 item". The chips below are hidden: the day panel lists them. */}
                  <span className="sr-only">{formatDateOnly(day, 'EEEE')}</span>{' '}
                  <span
                    className={cn(
                      'inline-grid size-7 place-items-center rounded-full font-display text-[1.0625rem] tabular-nums',
                      isToday && 'bg-primary font-semibold text-primary-foreground',
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>{' '}
                  <span className="sr-only">
                    {formatDateOnly(day, 'MMMM')},{' '}
                    {count ? `${count} item${count === 1 ? '' : 's'}` : 'nothing scheduled'}
                  </span>
                  {count > 0 && (
                    <ul aria-hidden="true" className="mt-1 grid gap-0.5">
                      {dayItems.slice(0, VISIBLE_ITEMS).map((item) => (
                        <Chip key={`${item.type}-${item.id}`} item={item} day={day} />
                      ))}
                      {count > VISIBLE_ITEMS && (
                        <li className="px-1 text-xs font-medium text-muted-foreground">
                          +{count - VISIBLE_ITEMS} more
                        </li>
                      )}
                    </ul>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export { MonthGrid };

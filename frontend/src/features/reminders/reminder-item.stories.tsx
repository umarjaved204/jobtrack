import type { Meta, StoryObj } from '@storybook/react-vite';

import type { Reminder } from '@/types/reminder';

import { toInstant } from './due';
import { ReminderItem } from './reminder-item';

/**
 * One follow-up in each state, against a fixed "now" (Friday 20 November 2026, 12:00 in
 * the viewer's zone). Overdue is said in words and marked with an icon, not colour alone.
 */
const meta = {
  title: 'Reminders/Follow-up',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = new Date(2026, 10, 20, 12, 0);
const base: Reminder = {
  id: 'r',
  title: '',
  application: null,
  due_on: null,
  due_at: null,
  done_at: null,
};
const reminders: Reminder[] = [
  { ...base, id: 'overdue', title: 'Chase Wise for take-home feedback', due_on: '2026-11-17' },
  { ...base, id: 'today', title: 'Send a thank-you note', due_on: '2026-11-20' },
  { ...base, id: 'timed', title: 'Call the recruiter back', due_at: toInstant('2026-11-21', '14:00') },
  { ...base, id: 'later', title: 'Check in if no reply', due_on: '2026-11-27' },
  { ...base, id: 'done', title: 'Update the case study', due_on: '2026-11-12', done_at: '2026-11-12T17:00:00Z' },
]; // prettier-ignore

const noop = () => undefined;

export const States: Story = {
  render: () => (
    <ul className="max-w-sm">
      {reminders.map((reminder) => (
        <ReminderItem
          key={reminder.id}
          reminder={reminder}
          now={NOW}
          onToggleDone={noop}
          onEdit={noop}
          onDelete={noop}
        />
      ))}
    </ul>
  ),
};

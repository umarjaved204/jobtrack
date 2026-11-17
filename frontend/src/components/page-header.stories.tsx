import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, Plus, SquareKanban } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';

/** Page-level building blocks used by every feature page. */
const meta = {
  title: 'Layout/Page header & empty state',
  component: PageHeader,
  args: {
    kicker: 'Pipeline',
    title: 'Applications',
    description: 'Every role you’re tracking, from wishlist to offer.',
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = {};

export const WithActions: Story = {
  args: {
    actions: (
      <>
        <Button variant="outline">
          <Download /> Export
        </Button>
        <Button>
          <Plus /> Add application
        </Button>
      </>
    ),
  },
};

export const EmptyPage: Story = {
  render: (args) => (
    <>
      <PageHeader {...args} />
      <EmptyState
        icon={SquareKanban}
        title="No applications yet"
        className="mt-10"
        action={
          <Button>
            <Plus /> Add your first application
          </Button>
        }
      >
        Track a role you&apos;ve applied for, or one you&apos;re eyeing. Each one gets a timeline,
        contacts and reminders.
      </EmptyState>
    </>
  ),
};

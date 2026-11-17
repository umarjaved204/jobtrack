import type { Meta, StoryObj } from '@storybook/react-vite';
import { Star } from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { applicationStatuses } from '@/types/application';

import { Badge } from './badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { children: 'Referral' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'solid', 'secondary', 'outline', 'destructive'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>
        <Star /> Dream company
      </Badge>
      <Badge variant="solid">New</Badge>
      <Badge variant="secondary">LinkedIn</Badge>
      <Badge variant="outline">Remote</Badge>
      <Badge variant="destructive">Deadline passed</Badge>
    </div>
  ),
};

export const ApplicationStatus: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {applicationStatuses.map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

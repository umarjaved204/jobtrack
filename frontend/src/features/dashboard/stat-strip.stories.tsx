import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatStrip, StatStripSkeleton } from './stat-strip';

/** The dashboard's headline figures. Counters roll on first load (and on range changes). */
const meta = {
  title: 'Dashboard/Stat strip',
  component: StatStrip,
  args: {
    cause: '90d',
    rangeLabel: 'Last 90 days',
    summary: {
      applied: 32,
      active: 14,
      interviewed: 9,
      offers: 2,
      interview_rate: 9 / 32,
      offer_rate: 2 / 32,
      wishlist: 6,
    },
  },
} satisfies Meta<typeof StatStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Figures: Story = {};

/** A new account, or a range with nothing in it: rates show a dash, not 0%. */
export const NothingYet: Story = {
  args: {
    summary: {
      applied: 0,
      active: 0,
      interviewed: 0,
      offers: 0,
      interview_rate: null,
      offer_rate: null,
      wishlist: 0,
    },
  },
};

export const Loading: Story = {
  render: () => <StatStripSkeleton />,
};

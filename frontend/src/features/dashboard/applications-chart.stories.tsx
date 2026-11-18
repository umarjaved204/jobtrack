import type { Meta, StoryObj } from '@storybook/react-vite';

import { ApplicationsChart } from './applications-chart';

const weekly = [1, 3, 2, 4, 0, 3, 5, 2, 4, 1, 3, 2, 2].map((count, i) => ({
  start: new Date(Date.UTC(2026, 7, 24 + i * 7)).toISOString().slice(0, 10),
  count,
}));

/** Applications per week (or month). The last bucket holds "today", so it's drawn lighter. */
const meta = {
  title: 'Dashboard/Applications over time',
  component: ApplicationsChart,
  args: {
    series: { interval: 'week', points: weekly },
    today: '2026-11-18',
  },
  decorators: [
    (Story) => (
      <div className="max-w-4xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ApplicationsChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Weekly: Story = {};

export const Monthly: Story = {
  args: {
    series: {
      interval: 'month',
      points: [3, 6, 4, 9, 12, 7, 10, 8, 5, 11, 2].map((count, i) => ({
        start: `2026-${String(i + 1).padStart(2, '0')}-01`,
        count,
      })),
    },
  },
};

export const Empty: Story = {
  args: { series: { interval: 'week', points: weekly.map((p) => ({ ...p, count: 0 })) } },
};

/** Refetching for a new range: the previous chart stays, dimmed. */
export const Refreshing: Story = { args: { stale: true } };

import type { Meta, StoryObj } from '@storybook/react-vite';

import { Funnel } from './funnel';
import { Sources } from './sources';

/** The dashboard's bar lists: how far applications got, and where they came from. */
const meta = {
  title: 'Dashboard/Pipeline and sources',
  component: Funnel,
  args: {
    funnel: {
      stages: [
        { stage: 'applied', count: 32, rate_from_previous: null },
        { stage: 'screening', count: 17, rate_from_previous: 17 / 32 },
        { stage: 'interview', count: 9, rate_from_previous: 9 / 17 },
        { stage: 'offer', count: 2, rate_from_previous: 2 / 9 },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Funnel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pipeline: Story = {};

/** With the summary's Rejected and Withdrawn totals under the bars. */
export const PipelineWithOutcomes: Story = {
  args: { outcomes: { rejected: 13, withdrawn: 5 } },
};

export const PipelineEmpty: Story = {
  args: {
    funnel: {
      stages: (['applied', 'screening', 'interview', 'offer'] as const).map((stage) => ({
        stage,
        count: 0,
        rate_from_previous: null,
      })),
    },
  },
};

/** Sources with fewer than 5 applications have their rate flagged. */
export const SourceBreakdown: Story = {
  render: () => (
    <Sources
      sources={{
        sources: [
          { source: 'LinkedIn', applied: 12, interviewed: 3, interview_rate: 3 / 12 },
          { source: 'Referral', applied: 7, interviewed: 4, interview_rate: 4 / 7 },
          { source: 'Company website', applied: 6, interviewed: 1, interview_rate: 1 / 6 },
          { source: 'Otta', applied: 4, interviewed: 1, interview_rate: 1 / 4 },
          { source: null, applied: 3, interviewed: 0, interview_rate: 0 },
        ],
      }}
    />
  ),
};

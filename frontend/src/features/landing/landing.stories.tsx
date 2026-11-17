import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

import { LandingPage } from './landing-page';
import { SampleWeek } from './sample-week';

const meta = {
  title: 'Pages/Landing',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The public front page. Try it in both themes and at phone width. */
export const Page: Story = {
  render: () => <LandingPage />,
};

/** The example-week column, also shown beside the sign-in and sign-up forms. */
export const SampleWeekColumn: Story = {
  parameters: { layout: 'padded' },
  render: () => <SampleWeek className="max-w-sm" />,
};

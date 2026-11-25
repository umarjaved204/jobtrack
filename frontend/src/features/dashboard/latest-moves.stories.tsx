import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';

import type { Move } from '@/types/analytics';

import { LatestMoves } from './latest-moves';

const at = (company: string, role_title: string, from: Move['from_status'], to: Move['to_status'], moved_at: string): Move => ({
  application_id: company.toLowerCase(), company, role_title, from_status: from, to_status: to, moved_at,
}); // prettier-ignore

const moves: Move[] = [
  at('Monzo', 'Senior Frontend Engineer', 'screening', 'interview', '2026-11-17T15:42:00Z'),
  at('Wise', 'Frontend Engineer, Payments', 'applied', 'screening', '2026-11-16T09:05:00Z'),
  at('Deliveroo', 'Product Engineer', 'interview', 'rejected', '2026-11-14T17:30:00Z'),
  at('Figma', 'Design Systems Engineer', 'wishlist', 'applied', '2026-11-12T11:12:00Z'),
  at('Octopus Energy', 'Product Engineer', 'applied', 'withdrawn', '2026-11-10T08:20:00Z'),
];

/** The dashboard's ledger of recent status changes, newest first. */
const meta = {
  title: 'Dashboard/Latest moves',
  component: LatestMoves,
  args: { moves: { moves } },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="max-w-4xl">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof LatestMoves>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Moves: Story = {};

export const NothingYet: Story = { args: { moves: { moves: [] } } };

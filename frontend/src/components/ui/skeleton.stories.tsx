import type { Meta, StoryObj } from '@storybook/react-vite';

import { Loading } from '@/components/loading';

import { Card, CardContent, CardHeader } from './card';
import { Separator } from './separator';
import { Skeleton } from './skeleton';

const meta = {
  title: 'UI/Skeleton & Separator',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading state for an application card: same footprint as the real thing. `Loading`
 * marks the region busy and names it with visually hidden text. */
export const LoadingCard: Story = {
  render: () => (
    <Loading label="Loading the application">
      <Card className="max-w-sm">
        <CardHeader>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    </Loading>
  ),
};

export const Separators: Story = {
  render: () => (
    <div className="grid max-w-md gap-4">
      <p className="text-sm">Hairline (default): quiet dividers inside cards and lists.</p>
      <Separator />
      <p className="text-sm">Rule: full-ink newspaper rule between sections.</p>
      <Separator weight="rule" />
      <div className="flex h-6 items-center gap-3 text-sm">
        <span>Monzo</span>
        <Separator orientation="vertical" />
        <span>London</span>
        <Separator orientation="vertical" />
        <span>Hybrid</span>
      </div>
    </div>
  ),
};

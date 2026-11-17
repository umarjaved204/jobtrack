import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExternalLink, MoreHorizontal } from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';

import { Badge } from './badge';
import { Button } from './button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';
import { Separator } from './separator';

const meta = {
  title: 'UI/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ApplicationCard: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Senior Frontend Engineer</CardTitle>
        <CardDescription>Monzo · London (hybrid)</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="interview" />
          <Badge variant="secondary">Referral</Badge>
        </div>
        <p className="figures text-sm text-muted-foreground">
          £75,000–£90,000 · Applied 2026-11-03
        </p>
      </CardContent>
      <Separator />
      <CardFooter>
        <Button variant="link" size="sm">
          Job posting <ExternalLink />
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const StatCard: Story = {
  render: () => (
    <Card className="max-w-xs">
      <CardHeader>
        <p className="kicker text-muted-foreground">Interview rate</p>
      </CardHeader>
      <CardContent>
        <p className="figures text-numeral text-primary-text">23%</p>
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-semibold text-forest">+4 pts</span> vs. last 30 days
        </p>
      </CardContent>
    </Card>
  ),
};

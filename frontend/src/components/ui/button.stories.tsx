import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, Download, Plus, Trash2 } from 'lucide-react';
import { fn } from 'storybook/test';

import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Add application', onClick: fn() },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'ink', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'xs', 'sm', 'lg', 'icon', 'icon-sm', 'icon-lg'],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args}>
        <Plus /> Add application
      </Button>
      <Button {...args} variant="ink">
        Run match
      </Button>
      <Button {...args} variant="outline">
        <Download /> Export CSV
      </Button>
      <Button {...args} variant="secondary">
        Save draft
      </Button>
      <Button {...args} variant="ghost">
        Cancel
      </Button>
      <Button {...args} variant="destructive">
        <Trash2 /> Delete
      </Button>
      <Button {...args} variant="link">
        View timeline <ArrowRight />
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} size="xs">
        Extra small
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args}>Default</Button>
      <Button {...args} size="lg">
        Large
      </Button>
      <Button {...args} size="icon-sm" variant="outline" aria-label="Add">
        <Plus />
      </Button>
      <Button {...args} size="icon" variant="outline" aria-label="Add">
        <Plus />
      </Button>
      <Button {...args} size="icon-lg" variant="outline" aria-label="Add">
        <Plus />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const AsLink: Story = {
  name: 'As link (asChild)',
  render: (args) => (
    <Button asChild variant={args.variant}>
      <a href="#applications">Open pipeline</a>
    </Button>
  ),
};

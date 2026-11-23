import type { Meta, StoryObj } from '@storybook/react-vite';

import { Kbd } from './kbd';

const meta = {
  title: 'UI/Kbd',
  component: Kbd,
  args: { children: 'Esc' },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** As the ⌘K palette's footer uses them. */
export const Shortcuts: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd> or <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd> to search
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> to move
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>Enter</Kbd> to open
      </span>
    </div>
  ),
};

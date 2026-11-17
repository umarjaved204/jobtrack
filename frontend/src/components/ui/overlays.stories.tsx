import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Download, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Input } from './input';
import { Label } from './label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

/** Radix-based overlays: dialog, dropdown menu, tooltip. All keyboard operable. */
const meta = {
  title: 'UI/Overlays',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmDialog: Story = {
  name: 'Dialog: confirm',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 /> Delete application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Monzo application?</DialogTitle>
          <DialogDescription>
            Its timeline, contacts and notes will be removed. This can’t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const FormDialog: Story = {
  name: 'Dialog: form',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil /> Add contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>Recruiters and interviewers for this application.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input id="contact-name" defaultValue="Priya Shah" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" type="email" placeholder="priya@example.com" />
          </div>
        </div>
        <DialogFooter showCloseButton>
          <Button>Save contact</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

function RowActionsMenu() {
  const [showArchived, setShowArchived] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Application actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Application</DropdownMenuLabel>
        <DropdownMenuItem>
          <Pencil /> Edit <DropdownMenuShortcut>E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Copy /> Duplicate <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Download /> Export JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={showArchived} onCheckedChange={setShowArchived}>
          Show in archive
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const Menu: Story = {
  name: 'Dropdown menu',
  render: () => <RowActionsMenu />,
};

export const Tooltips: Story = {
  render: () => (
    <TooltipProvider>
      <div className="flex gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Export">
              <Download />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download as CSV or JSON</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Duplicate">
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Duplicate application</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ),
};

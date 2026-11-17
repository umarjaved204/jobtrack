import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

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

function DeleteDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete application</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this application?</DialogTitle>
          <DialogDescription>Its timeline, contacts and notes go with it.</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('opens a labelled, described modal from its trigger', async () => {
    const user = userEvent.setup();
    render(<DeleteDialog />);

    await user.click(screen.getByRole('button', { name: 'Delete application' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete this application?' });
    expect(dialog).toHaveAccessibleDescription('Its timeline, contacts and notes go with it.');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<DeleteDialog />);
    const trigger = screen.getByRole('button', { name: 'Delete application' });

    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  // Footer "Close" button (index 0) and the corner icon button with an sr-only label (index 1).
  it.each([
    ['footer', 0],
    ['corner', 1],
  ])('closes from the %s close button', async (_where, index) => {
    const user = userEvent.setup();
    render(<DeleteDialog />);

    await user.click(screen.getByRole('button', { name: 'Delete application' }));
    const dialog = await screen.findByRole('dialog');
    const closeButtons = within(dialog).getAllByRole('button', { name: 'Close' });
    expect(closeButtons).toHaveLength(2);

    await user.click(closeButtons[index] as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

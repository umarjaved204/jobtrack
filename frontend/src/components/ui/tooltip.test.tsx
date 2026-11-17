import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('Tooltip', () => {
  it('shows on keyboard focus and describes its trigger', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" aria-label="Export">
              ⤓
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download CSV or JSON</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.tab();
    const trigger = screen.getByRole('button', { name: 'Export' });
    expect(trigger).toHaveFocus();

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Download CSV or JSON');
    expect(trigger).toHaveAccessibleDescription('Download CSV or JSON');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

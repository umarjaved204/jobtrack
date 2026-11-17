import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Checkbox } from './checkbox';
import { FormField } from './form-field';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

function WorkModeSelect() {
  const [value, setValue] = useState('none');
  return (
    <>
      <FormField label="Work mode" error={value === 'none' ? 'Pick a work mode' : undefined}>
        {(control) => (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger {...control}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              <SelectItem value="remote">Remote</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
              <SelectItem value="onsite">On-site</SelectItem>
            </SelectContent>
          </Select>
        )}
      </FormField>
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('Select', () => {
  it('is a labelled combobox showing the current value, wired to its error', () => {
    render(<WorkModeSelect />);
    const trigger = screen.getByRole('combobox', { name: 'Work mode' });
    expect(trigger).toHaveTextContent('Not specified');
    expect(trigger).toBeInvalid();
    expect(trigger).toHaveAccessibleDescription('Pick a work mode');
  });

  it('opens from the keyboard and picks an option', async () => {
    const user = userEvent.setup();
    render(<WorkModeSelect />);
    const trigger = screen.getByRole('combobox', { name: 'Work mode' });

    trigger.focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: 'Hybrid' }));

    expect(screen.getByTestId('value')).toHaveTextContent('hybrid');
    expect(trigger).toHaveTextContent('Hybrid');
    expect(trigger).toHaveFocus(); // focus returns to the trigger
  });
});

describe('Checkbox', () => {
  it('toggles with a click on its label and with Space', async () => {
    const user = userEvent.setup();
    render(
      <div className="flex items-center gap-2">
        <Checkbox id="remote-only" />
        <Label htmlFor="remote-only">Remote only</Label>
      </div>,
    );
    const box = screen.getByRole('checkbox', { name: 'Remote only' });

    await user.click(screen.getByText('Remote only'));
    expect(box).toBeChecked();
    await user.keyboard(' ');
    expect(box).not.toBeChecked();
  });
});

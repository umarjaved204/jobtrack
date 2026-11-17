import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Input } from './input';
import { Label } from './label';
import { Textarea } from './textarea';

describe('Label + Input', () => {
  it('associates the label with the input', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Label htmlFor="company">Company</Label>
        <Input id="company" />
      </>,
    );
    const input = screen.getByLabelText('Company');
    await user.click(screen.getByText('Company'));
    expect(input).toHaveFocus();

    await user.keyboard('Monzo');
    expect(input).toHaveValue('Monzo');
  });

  it('exposes the invalid state to assistive tech', () => {
    render(<Input aria-label="Email" aria-invalid aria-describedby="email-error" />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toBeInvalid();
    expect(input).toHaveAttribute('aria-describedby', 'email-error');
  });
});

describe('Textarea', () => {
  it('accepts multi-line text', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" />);
    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    await user.type(textarea, 'Recruiter call{enter}Ask about visa sponsorship');
    expect(textarea).toHaveValue('Recruiter call\nAsk about visa sponsorship');
  });
});

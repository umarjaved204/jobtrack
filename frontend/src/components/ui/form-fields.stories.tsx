import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from './input';
import { Label } from './label';
import { Textarea } from './textarea';

/** Input, Textarea and Label together, as they appear in the application form. */
const meta = {
  title: 'UI/Form fields',
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fields: Story = {
  render: () => (
    <form className="grid max-w-md gap-5" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-2">
        <Label htmlFor="company">Company</Label>
        <Input id="company" placeholder="e.g. Monzo" defaultValue="Monzo" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="role">Role title</Label>
        <Input id="role" placeholder="e.g. Senior Frontend Engineer" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="url">Job URL</Label>
        <Input
          id="url"
          type="url"
          aria-invalid
          aria-describedby="url-error"
          defaultValue="monzo.com/careers"
        />
        <p id="url-error" className="text-sm font-medium text-destructive">
          Enter a full URL, starting with https://
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="salary">Salary (min)</Label>
        <Input id="salary" inputMode="numeric" className="figures" defaultValue="65000" disabled />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Anything worth remembering before the interview"
          defaultValue="Hiring manager: Priya Shah. Ask about the design-system team and on-call."
        />
      </div>
    </form>
  ),
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, 'aria-label': 'Email', defaultValue: 'sam@' },
};

import type { Meta, StoryObj } from '@storybook/react-vite';

import { Alert } from './alert';
import { FormField } from './form-field';
import { Input } from './input';
import { PasswordInput } from './password-input';
import { Textarea } from './textarea';

/**
 * Form controls inside FormField (label, hint and error wired to the control), plus the
 * form-level Alert. As they appear in the application and sign-in forms.
 */
const meta = {
  title: 'UI/Form fields',
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fields: Story = {
  render: () => (
    <form className="grid max-w-md gap-5" onSubmit={(e) => e.preventDefault()}>
      <FormField label="Company">
        <Input placeholder="e.g. Monzo" defaultValue="Monzo" />
      </FormField>
      <FormField label="Role title">
        <Input placeholder="e.g. Senior Frontend Engineer" />
      </FormField>
      <FormField label="Job URL" error="Enter a full URL, starting with https://">
        <Input type="url" defaultValue="monzo.com/careers" />
      </FormField>
      <FormField label="Salary (min)" description="Annual, before tax.">
        <Input inputMode="numeric" className="figures" defaultValue="65000" disabled />
      </FormField>
      <FormField label="Notes">
        <Textarea
          placeholder="Anything worth remembering before the interview"
          defaultValue="Hiring manager: Priya Shah. Ask about the design-system team and on-call."
        />
      </FormField>
    </form>
  ),
};

export const Password: Story = {
  render: () => (
    <div className="grid max-w-md gap-5">
      <FormField label="Password" description="At least 8 characters.">
        <PasswordInput defaultValue="correct horse battery" autoComplete="new-password" />
      </FormField>
      <FormField label="Password" error="Use at least 8 characters">
        <PasswordInput defaultValue="short" />
      </FormField>
    </div>
  ),
};

export const Alerts: Story = {
  render: () => (
    <div className="grid max-w-md gap-4">
      <Alert>Incorrect email or password</Alert>
      <Alert>Too many attempts, please try again later. Try again in 42 seconds.</Alert>
      <Alert tone="info">Your session expired. Sign in again to carry on.</Alert>
      <Alert tone="info" title="Heads up">
        Matching against a resume arrives in Phase 9.
      </Alert>
    </div>
  ),
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, 'aria-label': 'Email', defaultValue: 'sam@' },
};

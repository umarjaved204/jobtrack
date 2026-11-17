import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';

/**
 * The sign-in and sign-up forms. Storybook has no API, so submitting shows the
 * "can't reach the server" path; validation, the password toggle and focus all work.
 */
const meta = {
  title: 'Auth/Forms',
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <div className="max-w-md">
            <Story />
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {
  render: () => <LoginForm next="/dashboard" />,
};

export const SignUp: Story = {
  render: () => <RegisterForm next="/dashboard" />,
};

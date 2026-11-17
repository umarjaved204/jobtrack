import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { makeApplication } from '@/test/fake-applications';

import { tagKeys } from './api';
import { ApplicationFormSheet, type ApplicationFormMode } from './application-form-sheet';

/**
 * The add/edit panel. Storybook has no API: tags are pre-loaded, and saving shows the
 * "can't reach JobTrack" message. Validation, the unsaved-changes prompt and focus return
 * all work.
 */
const meta = {
  title: 'Applications/Form panel',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => {
      const client = new QueryClient();
      client.setQueryData(tagKeys.all, [
        { id: 't-remote', name: 'Remote', color: 'cobalt' },
        { id: 't-referral', name: 'Referral', color: 'forest' },
        { id: 't-fintech', name: 'Fintech', color: 'plum' },
      ]);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ mode, label }: { mode: ApplicationFormMode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <ApplicationFormSheet open={open} onOpenChange={setOpen} mode={mode} />
    </>
  );
}

export const Create: Story = {
  render: () => <Demo label="Add application" mode={{ type: 'create', status: 'applied' }} />,
};

export const Edit: Story = {
  render: () => (
    <Demo
      label="Edit Monzo"
      mode={{
        type: 'edit',
        application: makeApplication({
          tags: [{ id: 't-remote', name: 'Remote', color: 'cobalt' }],
        }),
      }}
    />
  ),
};

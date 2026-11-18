import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { resumeKeys } from '@/features/resumes/api';
import { makeApplication, makeResume } from '@/test/fake-applications';

import { tagKeys } from './api';
import { ApplicationFormSheet, type ApplicationFormMode } from './application-form-sheet';

/**
 * The add/edit panel. Storybook has no API: tags and resume versions are pre-loaded
 * (the edit story's application used a since-archived version), and saving shows the
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
      client.setQueryData(resumeKeys.list(), [
        makeResume({ id: 'r-v3', label: 'Frontend v3 (product)', is_default: true }),
        makeResume({ id: 'r-v2', label: 'Frontend v2 (design systems)' }),
        makeResume({ id: 'r-v1', label: 'Frontend v1', archived_at: '2026-09-01T10:00:00Z' }),
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
          resume_version_id: 'r-v1',
        }),
      }}
    />
  ),
};

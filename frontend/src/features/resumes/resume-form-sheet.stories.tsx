import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { makeResume } from '@/test/fake-applications';

import { ResumeFormSheet, type ResumeFormMode } from './resume-form-sheet';
import { duplicateValues } from './resume-schema';

/**
 * Add, duplicate or edit a resume version. Storybook has no API, so saving shows the
 * "can't reach JobTrack" message; the counter, validation, the locked text of a sent
 * version and the unsaved-changes prompt all work.
 */
const meta = {
  title: 'Resumes/Version panel',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SENT = makeResume({
  label: 'Frontend v3 (product)',
  is_default: true,
  application_count: 4,
  content_text: `Sam Okafor
London | sam.okafor@jobtrack-demo.com

Product-minded frontend engineer. I ship measurable improvements to customer journeys,
from research to release, with strong foundations in accessibility and testing.

Skills
React, TypeScript, Next.js, Node.js, GraphQL, Playwright`,
});

function Demo({ mode, label }: { mode: ResumeFormMode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <ResumeFormSheet
        mode={open ? mode : null}
        onClose={() => setOpen(false)}
        onSaved={() => setOpen(false)}
      />
    </>
  );
}

export const Create: Story = {
  render: () => <Demo label="Add a version" mode={{ type: 'create' }} />,
};

/** A version that was sent: the label can change, the text can't. */
export const EditSentVersion: Story = {
  render: () => <Demo label="Rename" mode={{ type: 'edit', resume: SENT }} />,
};

export const Duplicate: Story = {
  render: () => (
    <Demo
      label="Duplicate as new version"
      mode={{ type: 'create', initial: duplicateValues(SENT) }}
    />
  ),
};

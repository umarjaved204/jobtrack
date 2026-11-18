import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { TagChip } from '@/components/tag-chip';
import { tagKeys } from '@/features/applications/api';
import { TagPicker } from '@/features/applications/tag-picker';
import { paletteColors } from '@/lib/palette';
import { workModeLabels, workModes } from '@/types/application';

import { Checkbox } from './checkbox';
import { FormField } from './form-field';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/** Choice controls used by the application form and the table filters. */
const meta = {
  title: 'UI/Select, checkbox & tags',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function WorkModeField() {
  const [value, setValue] = useState('hybrid');
  return (
    <FormField label="Work mode" description="How often you’d be in the office.">
      {(control) => (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger {...control}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not specified</SelectItem>
            {workModes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {workModeLabels[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export const SelectField: Story = {
  name: 'Select',
  render: () => (
    <div className="max-w-sm">
      <WorkModeField />
    </div>
  ),
};

export const Checkboxes: Story = {
  render: () => (
    <fieldset className="grid gap-3">
      <legend className="mb-2 kicker text-muted-foreground">Show</legend>
      {['Active applications', 'Rejected', 'Withdrawn'].map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <Checkbox id={`show-${i}`} defaultChecked={i === 0} />
          <Label htmlFor={`show-${i}`} className="font-normal">
            {label}
          </Label>
        </div>
      ))}
    </fieldset>
  ),
};

export const TagChips: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {paletteColors.map((color) => (
        <TagChip key={color} name={color} color={color} className="capitalize" />
      ))}
      <TagChip name="Removable" color="cobalt" onRemove={() => undefined} />
    </div>
  ),
};

function TagPickerField() {
  const [value, setValue] = useState(['t-remote']);
  return (
    <FormField label="Tags">
      <TagPicker value={value} onChange={setValue} />
    </FormField>
  );
}

export const Tags: Story = {
  name: 'Tag picker',
  decorators: [
    (Story) => {
      // No API in Storybook: start with tags in the cache (creating one will fail offline).
      const client = new QueryClient();
      client.setQueryData(tagKeys.all, [
        { id: 't-dream', name: 'Dream job', color: 'vermilion' },
        { id: 't-fintech', name: 'Fintech', color: 'plum' },
        { id: 't-referral', name: 'Referral', color: 'forest' },
        { id: 't-remote', name: 'Remote', color: 'cobalt' },
      ]);
      return (
        <QueryClientProvider client={client}>
          <div className="max-w-sm">
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
  render: () => <TagPickerField />,
};

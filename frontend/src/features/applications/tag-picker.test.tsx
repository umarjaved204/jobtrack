import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { FormField } from '@/components/ui/form-field';
import { createQueryClient } from '@/lib/query-client';
import { mockApplicationsBackend } from '@/test/fake-applications';
import { mockAuthBackend, server } from '@/test/msw';
import type { Tag } from '@/types/application';

import { MAX_TAGS, TagPicker } from './tag-picker';

const TAGS: Tag[] = [
  { id: 'tag-remote', name: 'Remote', color: 'cobalt' },
  { id: 'tag-referral', name: 'Referral', color: 'forest' },
  { id: 'tag-fintech', name: 'Fintech', color: 'plum' },
];

/** The picker inside a form field, with its value shown so tests can read it. */
function Harness({ initial = [] }: { initial?: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <FormField label="Tags" description="Group roles your own way.">
        <TagPicker value={value} onChange={setValue} />
      </FormField>
      <output data-testid="value">{value.join(',')}</output>
    </>
  );
}

function renderPicker(initial?: string[]) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
  return { value: () => screen.getByTestId('value').textContent };
}

async function openPicker() {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Tags'));
  const search = await screen.findByRole('combobox', { name: 'Search or create a tag' });
  return { user, search };
}

let backend: ReturnType<typeof mockApplicationsBackend>;
beforeEach(() => {
  mockAuthBackend({ signedIn: true });
  backend = mockApplicationsBackend({ tags: TAGS });
});

describe('TagPicker', () => {
  it('is labelled and described by its form field', () => {
    renderPicker();
    const trigger = screen.getByLabelText('Tags');
    expect(trigger).toHaveTextContent('Add tags');
    expect(trigger).toHaveAccessibleDescription('Group roles your own way.');
  });

  it('selects and deselects tags from the list', async () => {
    const view = renderPicker();
    const { user } = await openPicker();

    await user.click(await screen.findByRole('option', { name: /Remote/ }));
    await user.click(screen.getByRole('option', { name: /Fintech/ }));
    expect(view.value()).toBe('tag-remote,tag-fintech');
    expect(screen.getByRole('option', { name: /Remote, selected/ })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Remote/ }));
    expect(view.value()).toBe('tag-fintech');
  });

  it('filters as you type and works from the keyboard', async () => {
    const view = renderPicker();
    const { user } = await openPicker();

    await user.keyboard('ref');
    // Matching tags first; creating "ref" is still offered (it isn't an exact name).
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Referral',
      'Create “ref”',
    ]);
    await user.keyboard('{Enter}'); // the top match
    expect(view.value()).toBe('tag-referral');
  });

  it('shows chosen tags as chips that can be removed', async () => {
    const view = renderPicker(['tag-remote', 'tag-referral']);
    const user = userEvent.setup();

    const chips = await screen.findByRole('list', { name: 'Selected tags' });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Remote', 'Referral']);
    await user.click(screen.getByRole('button', { name: 'Remove Remote' }));
    expect(view.value()).toBe('tag-referral');
  });

  it('creates a tag that doesn’t exist yet, and selects it', async () => {
    const view = renderPicker();
    const { user } = await openPicker();

    await user.keyboard('Visa sponsorship');
    await user.click(screen.getByRole('option', { name: 'Create “Visa sponsorship”' }));

    await within(await screen.findByRole('list', { name: 'Selected tags' })).findByText(
      'Visa sponsorship',
    );
    const created = backend.tags.find((t) => t.name === 'Visa sponsorship');
    expect(view.value()).toBe(created?.id);
  });

  it('doesn’t offer to create a name that exists (any case)', async () => {
    renderPicker();
    const { user } = await openPicker();

    await user.keyboard('remote');
    expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Remote/ })).toBeInTheDocument();
  });

  it('shows the server error if creating fails (e.g. a duplicate made elsewhere)', async () => {
    server.use(
      http.post('/api/v1/tags', () =>
        HttpResponse.json({ detail: 'A tag with this name already exists' }, { status: 409 }),
      ),
    );
    renderPicker();
    const { user } = await openPicker();

    await user.keyboard('Dream job');
    await user.click(screen.getByRole('option', { name: 'Create “Dream job”' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A tag with this name already exists',
    );
  });

  it(`stops at ${MAX_TAGS} tags, like the API`, async () => {
    const many = Array.from({ length: MAX_TAGS }, (_, i) => `tag-${i}`);
    backend.tags.push(
      ...many.map((id, i) => ({ id, name: `Tag ${String(i).padStart(2, '0')}`, color: 'ink' })),
    );
    renderPicker(many);
    await openPicker();

    expect(await screen.findByText(`Up to ${MAX_TAGS} tags per application.`)).toBeVisible();
    expect(screen.getByRole('option', { name: /Remote/ })).toHaveAttribute('aria-disabled', 'true');
  });
});

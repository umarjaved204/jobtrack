import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { TagChip } from '@/components/tag-chip';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isApiError } from '@/lib/api/errors';
import { paletteColors } from '@/lib/palette';
import { cn } from '@/lib/utils';

import { tagsQuery, useCreateTag } from './api';

/** Backend limit: ApplicationCreate.tag_ids max_length=20. */
export const MAX_TAGS = 20;

type TagPickerProps = {
  /** Selected tag ids, in the order chosen. */
  value: string[];
  onChange: (ids: string[]) => void;
} & Omit<ComponentProps<'button'>, 'value' | 'onChange'>; // id / aria-* from FormField

/**
 * Choose tags, or create one on the spot. A popover with a searchable list (cmdk); the
 * chosen tags show as removable chips below the trigger. Works inside FormField: the
 * label, hint and error attach to the trigger button.
 */
function TagPicker({ value, onChange, className, ...triggerProps }: TagPickerProps) {
  const { data: tags = [] } = useQuery(tagsQuery());
  const createTag = useCreateTag();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const selected = value.flatMap((id) => byId.get(id) ?? []);
  const trimmed = search.trim();
  const exists = tags.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
  const atLimit = value.length >= MAX_TAGS;

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const create = () => {
    if (!trimmed || atLimit) return;
    createTag.mutate(
      // New tags cycle through the palette so they're easy to tell apart.
      { name: trimmed, color: paletteColors[tags.length % paletteColors.length] ?? 'ink' },
      {
        onSuccess: (tag) => {
          onChange([...value, tag.id]);
          setSearch('');
        },
      },
    );
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between border-input bg-card font-normal hover:border-foreground"
            {...triggerProps}
          >
            <span className={cn(!selected.length && 'text-muted-foreground')}>
              {selected.length
                ? `${selected.length} tag${selected.length === 1 ? '' : 's'} selected`
                : 'Add tags'}
            </span>
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
          {/* cmdk names its input via aria-labelledby → this label (aria-label would be ignored). */}
          <Command label="Search or create a tag">
            <CommandInput
              placeholder="Search or create a tag…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No tags yet. Type a name to create one.</CommandEmpty>
              {tags.length > 0 && (
                <CommandGroup heading="Tags">
                  {tags.map((tag) => {
                    const isSelected = value.includes(tag.id);
                    return (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        disabled={!isSelected && atLimit}
                        onSelect={() => toggle(tag.id)}
                      >
                        <Check
                          aria-hidden="true"
                          className={cn('text-primary-text', !isSelected && 'invisible')}
                        />
                        <TagChip name={tag.name} color={tag.color} />
                        {isSelected && <span className="sr-only">, selected</span>}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {trimmed && !exists && (
                // forceMount on the group too: cmdk hides a group whose items don't match.
                <CommandGroup forceMount>
                  <CommandItem
                    value={`create ${trimmed}`}
                    forceMount
                    disabled={atLimit || createTag.isPending}
                    onSelect={create}
                  >
                    <Plus aria-hidden="true" />
                    {createTag.isPending ? 'Creating…' : `Create “${trimmed}”`}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
            {createTag.isError && (
              <p role="alert" className="border-t px-3 py-2 text-sm text-destructive">
                {isApiError(createTag.error)
                  ? createTag.error.detail
                  : 'Couldn’t create the tag. Try again.'}
              </p>
            )}
            {atLimit && (
              <p className="border-t px-3 py-2 text-sm text-muted-foreground">
                Up to {MAX_TAGS} tags per application.
              </p>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <ul aria-label="Selected tags" className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <li key={tag.id}>
              <TagChip name={tag.name} color={tag.color} onRemove={() => toggle(tag.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { TagPicker };

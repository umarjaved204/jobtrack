import { Check, ChevronDown } from 'lucide-react';
import type * as React from 'react';

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
import { cn } from '@/lib/utils';

export type FilterOption = {
  value: string;
  /** Text for search and screen readers. */
  label: string;
  /** Optional richer rendering (a status badge, a tag chip). */
  display?: React.ReactNode;
};

type FilterMenuProps = {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Adds a search box (for long lists). */
  searchable?: boolean;
  emptyText?: string;
};

/**
 * A toolbar filter: a button that opens a list of options to tick (several at once).
 * The button shows how many are ticked; the list stays open while ticking.
 */
function FilterMenu({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  emptyText = 'Nothing to filter by yet.',
}: FilterMenuProps) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          // Control edge in --input; an active filter is outlined in ink.
          className={cn(
            'border-input bg-card font-medium',
            selected.length > 0 && 'border-foreground',
          )}
        >
          {label}
          {selected.length > 0 && (
            <span className="bg-primary-tint px-1 figures text-xs text-primary-text">
              {selected.length}
              <span className="sr-only"> selected</span>
            </span>
          )}
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {/* cmdk names its input via aria-labelledby → this label. */}
        <Command label={`Filter by ${label.toLowerCase()}`}>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>{options.length ? 'No matches.' : emptyText}</CommandEmpty>
            {options.length > 0 && (
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selected.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => toggle(option.value)}
                    >
                      <Check
                        aria-hidden="true"
                        className={cn('text-primary-text', !isSelected && 'invisible')}
                      />
                      {option.display ?? option.label}
                      {isSelected && <span className="sr-only">, selected</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center"
                onClick={() => onChange([])}
              >
                Clear {label.toLowerCase()}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { FilterMenu };

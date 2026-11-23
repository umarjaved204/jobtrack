import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { applicationsListQuery } from '@/features/applications/api';
import { SEARCH_DEBOUNCE_MS } from '@/features/applications/table-params';
import { useThemePreference } from '@/features/auth/hooks';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { Theme } from '@/lib/theme';

import {
  type CommandContext,
  type CommandGroupId,
  filterCommands,
  groupHeadings,
  paletteCommands,
  shortcutHint,
} from './commands';

const SEARCH_RESULTS = 8;
const RECENT_RESULTS = 5;

/** Masthead button for the palette; shows the shortcut where there's room for it. */
function CommandPaletteTrigger({ apple, onOpen }: { apple: boolean; onOpen: () => void }) {
  const hint = shortcutHint(apple);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onOpen}
      aria-keyshortcuts={hint.aria}
      className="text-muted-foreground hover:text-foreground"
    >
      <Search />
      <span className="sr-only sm:not-sr-only">Search</span>
      <span aria-hidden="true" className="hidden items-center gap-0.5 sm:inline-flex">
        {hint.keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
    </Button>
  );
}

/** Applications matching the typed words (server search, like the table), or the newest. */
function useApplicationResults(input: string) {
  const term = useDebouncedValue(input.trim(), SEARCH_DEBOUNCE_MS);
  const query = useQuery(
    applicationsListQuery(
      term
        ? { q: term, page_size: SEARCH_RESULTS }
        : { sort: '-created_at', page_size: RECENT_RESULTS },
    ),
  );
  return {
    heading: term ? 'Applications' : 'Recently added',
    items: query.data?.items ?? [],
    // Typing, waiting for the debounce, or showing the previous search's results.
    pending: input.trim() !== term || query.isPending || query.isPlaceholderData,
    failed: query.isError,
  };
}

function PaletteBody({ theme, onRun }: { theme: Theme; onRun: (run: CommandContextRun) => void }) {
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState('');
  const applications = useApplicationResults(input);
  const allCommands = useMemo(() => paletteCommands(theme), [theme]);
  const commands = filterCommands(allCommands, input);
  const groups = (['actions', 'navigation'] as CommandGroupId[])
    .map((group) => ({ group, commands: commands.filter((c) => c.group === group) }))
    .filter(({ commands }) => commands.length > 0);

  const showApplications = !applications.pending && !applications.failed;
  const values = [
    ...groups.flatMap(({ commands }) => commands.map((c) => c.id)),
    ...(showApplications ? applications.items.map((a) => `application-${a.id}`) : []),
  ];
  // Results arrive after typing, so the highlighted row may vanish: fall back to the first.
  const active = values.includes(selected) ? selected : (values[0] ?? '');
  const nothing = values.length === 0 && showApplications;

  let status: ReactNode = null;
  if (applications.failed) status = 'Couldn’t search your applications.';
  else if (applications.pending && input.trim()) status = 'Searching your applications…';

  return (
    <Command
      shouldFilter={false}
      loop
      value={active}
      onValueChange={setSelected}
      label="Command palette"
    >
      <CommandInput
        value={input}
        onValueChange={(value) => {
          setInput(value);
          setSelected('');
        }}
        placeholder="Search applications, pages and actions…"
        className="h-12"
      />
      <CommandList className="max-h-[min(24rem,60dvh)]">
        {groups.map(({ group, commands }) => (
          <CommandGroup key={group} heading={groupHeadings[group]}>
            {commands.map((command) => (
              <CommandItem key={command.id} value={command.id} onSelect={() => onRun(command.run)}>
                <command.icon aria-hidden="true" className="text-muted-foreground" />
                {command.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {showApplications && applications.items.length > 0 && (
          <CommandGroup heading={applications.heading}>
            {applications.items.map((application) => (
              <CommandItem
                key={application.id}
                value={`application-${application.id}`}
                onSelect={() =>
                  onRun(({ navigate }) => navigate(`/applications/${application.id}`))
                }
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{application.company}</span>
                  <span className="text-muted-foreground"> · {application.role_title}</span>
                </span>
                <StatusBadge status={application.status} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      {/* Outside the listbox (only options and groups belong there); always rendered, so
          screen readers announce what appears in it. */}
      <p
        role="status"
        className="px-3 text-center text-sm text-muted-foreground [&:not(:empty)]:py-4"
      >
        {status ?? (nothing ? `Nothing matches “${input.trim()}”.` : null)}
      </p>
      <div
        aria-hidden="true"
        className="hidden items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground sm:flex"
      >
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Enter</Kbd> to open
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> to close
        </span>
      </div>
    </Command>
  );
}

type CommandContextRun = (context: CommandContext) => void;

/**
 * The ⌘K palette: actions, pages and an application search in one list. The body mounts
 * only while open, so each opening starts empty and searches nothing in the background.
 */
function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { theme, setTheme } = useThemePreference();
  // Radix gives focus back to a DialogTrigger, and the palette has none (a shortcut or the
  // masthead button opens it): so remember what had focus, and return it ourselves. Except
  // after a navigation: then focus belongs to the new page's heading (the shell moves it
  // there) or to a form the page opened.
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const navigated = useRef(false);

  const run = (command: CommandContextRun) => {
    navigated.current = false;
    onOpenChange(false);
    command({
      navigate: (to, options) => {
        navigated.current = true;
        void navigate(to, options);
      },
      setTheme,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        onOpenAutoFocus={() => {
          // Runs before focus moves into the palette.
          returnFocusTo.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocusTo.current;
          if (!navigated.current && target?.isConnected) target.focus();
          returnFocusTo.current = null;
          navigated.current = false;
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search your applications, go to a page, or run an action.
        </DialogDescription>
        <PaletteBody theme={theme} onRun={run} />
      </DialogContent>
    </Dialog>
  );
}

export { CommandPalette, CommandPaletteTrigger };

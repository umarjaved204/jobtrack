import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { StatusBadge } from '@/components/status-badge';
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
import { monogram } from '@/features/applications/monogram';
import { SEARCH_DEBOUNCE_MS } from '@/features/applications/table-params';
import { useThemePreference } from '@/features/auth/hooks';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

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

/**
 * Masthead button for the palette. Desktop: drawn like a search field, with the shortcut.
 * Phone: a 44px search icon. One element either way; its name is the visible label.
 */
function CommandPaletteTrigger({ apple, onOpen }: { apple: boolean; onOpen: () => void }) {
  const hint = shortcutHint(apple);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-keyshortcuts={hint.aria}
      className={cn(
        // Focus: the global :focus-visible outline (index.css).
        'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-foreground',
        'transition-colors duration-(--duration-fast)',
        'md:h-10 md:w-auto md:min-w-65 md:justify-start md:gap-2.5 md:border md:border-input md:bg-panel md:px-3 md:text-sm md:text-muted-foreground',
        'hover:bg-accent md:hover:text-foreground',
      )}
    >
      <Search aria-hidden="true" className="size-5 md:size-4" />
      <span className="sr-only md:not-sr-only md:flex-1 md:text-left">Search or jump to…</span>
      <span aria-hidden="true" className="hidden items-center gap-0.5 md:inline-flex">
        {hint.keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
    </button>
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
        wrapperClassName="h-16 gap-3 border-rule px-4.5 [&>svg]:size-5 [&>svg]:text-foreground"
        className="h-16 font-display text-lg sm:text-xl md:text-2xl"
        end={
          <Kbd aria-hidden="true" className="hidden sm:inline-flex">
            Esc
          </Kbd>
        }
      />
      <CommandList className="max-h-[min(32.5rem,60dvh)] py-2">
        {groups.map(({ group, commands }) => (
          <CommandGroup key={group} heading={groupHeadings[group]} className={groupClass}>
            {commands.map((command) => (
              <CommandItem
                key={command.id}
                value={command.id}
                onSelect={() => onRun(command.run)}
                className={itemClass}
              >
                <Mark>
                  <command.icon aria-hidden="true" />
                </Mark>
                <Lines title={command.label} detail={command.detail} />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {showApplications && applications.items.length > 0 && (
          <CommandGroup heading={applications.heading} className={groupClass}>
            {applications.items.map((application) => (
              <CommandItem
                key={application.id}
                value={`application-${application.id}`}
                onSelect={() =>
                  onRun(({ navigate }) => navigate(`/applications/${application.id}`))
                }
                className={itemClass}
              >
                <Mark>{monogram(application.company)}</Mark>
                <Lines title={application.company} detail={application.role_title} />{' '}
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
        className="hidden items-center gap-4.5 border-t px-4.5 py-3 text-[0.8125rem] whitespace-nowrap text-muted-foreground sm:flex"
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
        <span className="ml-auto hidden md:inline">Searches applications, pages and actions</span>
      </div>
    </Command>
  );
}

/** Palette rows: 48px, inked when highlighted (paper text on ink, like the mockup). */
const itemClass =
  'group min-h-12 gap-3 px-4.5 py-1.5 data-[selected=true]:bg-foreground data-[selected=true]:text-background';
const groupClass =
  'p-0 pb-2 [&_[cmdk-group-heading]]:px-4.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5';

/** The square at the start of a row: an icon, or an application's monogram. */
function Mark({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 shrink-0 place-items-center border border-input font-display text-[0.8125rem] font-semibold group-data-[selected=true]:border-background [&_svg]:size-3.5"
    >
      {children}
    </span>
  );
}

/** Title and a second line. The second line stays out of the option's name (it's a hint),
 * so the name is what the row is called. */
function Lines({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="grid min-w-0 flex-1">
      <span className="truncate text-base font-semibold">{title}</span>
      <span aria-hidden="true" className="truncate text-[0.8125rem] opacity-80">
        {detail}
      </span>
    </span>
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
        className="top-[12dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[42.5rem]"
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

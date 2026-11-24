import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser, useSignOut } from '@/features/auth/hooks';

/** "Sam Okafor" → "SO"; single names give one letter. */
function initials(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : words.slice(0, 1);
  return letters.map((w) => w?.[0]?.toUpperCase() ?? '').join('');
}

/** Account menu in the masthead: who is signed in, settings, sign out. */
function UserMenu() {
  const user = useCurrentUser();
  const signOut = useSignOut();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 gap-2.5 px-1.5 text-[0.9375rem] has-[>svg]:px-1.5"
          aria-label={`Account: ${user.full_name}`}
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-primary text-[0.8125rem] font-bold text-primary-foreground"
          >
            {initials(user.full_name)}
          </span>
          <span className="hidden max-w-40 truncate md:inline">{user.full_name}</span>
          <ChevronDown aria-hidden="true" className="hidden size-3.5 md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-semibold">{user.full_name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
          <LogOut /> {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserMenu };

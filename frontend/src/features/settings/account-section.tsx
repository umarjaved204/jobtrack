import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteAccount } from '@/features/auth/api';
import { useCurrentUser } from '@/features/auth/hooks';
import { isApiError } from '@/lib/api/errors';

import { SettingsSection } from './settings-section';

/** Emails are stored lowercased; what's typed is compared the same way, ignoring spaces. */
const sameEmail = (typed: string, email: string) => typed.trim().toLowerCase() === email;

/**
 * Deletes the account and everything in it. A heavier confirmation than ConfirmDialog:
 * nothing can be recovered, so the user types their email first (and is pointed at the
 * export above).
 */
function AccountSection() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const remove = useMutation({ mutationFn: deleteAccount });
  // The sign-out handler navigates away on success; nothing else to do here.
  const email = user?.email ?? '';
  const confirmed = email !== '' && sameEmail(typed, email);

  const openDialog = () => {
    remove.reset();
    setTyped('');
    setOpen(true);
  };

  return (
    <SettingsSection id="account">
      <div className="flex flex-wrap items-center justify-between gap-4 border-2 border-oxblood p-4.5">
        <div className="grid max-w-prose gap-1">
          <p className="text-[1.0625rem] font-bold text-oxblood">Delete your account</p>
          <p className="text-sm leading-normal">
            Permanently deletes your account and everything in it: applications, resume versions,
            reminders, events and match results. Export first if you want a copy.
          </p>
        </div>
        <Button variant="destructive" onClick={openDialog}>
          Delete account…
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => !remove.isPending && setOpen(next)}>
        <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (confirmed) remove.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                Everything you’ve entered in JobTrack is deleted straight away and can’t be
                recovered.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={inputId}>
                Type <span className="font-mono font-normal">{email}</span> to confirm
              </Label>
              <Input
                id={inputId}
                type="email"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                disabled={remove.isPending}
              />
            </div>
            {remove.isError && (
              <p role="alert" className="text-sm text-destructive">
                {isApiError(remove.error)
                  ? remove.error.detail
                  : 'Couldn’t delete the account. Try again.'}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={!confirmed || remove.isPending}>
                {remove.isPending ? 'Deleting…' : 'Delete my account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

export { AccountSection };

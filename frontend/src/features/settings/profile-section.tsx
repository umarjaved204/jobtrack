import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { sessionQueryKey, updateProfile } from '@/features/auth/api';
import { applyServerError } from '@/features/auth/form-errors';
import { useCurrentUser } from '@/features/auth/hooks';
import { useFormAlert } from '@/features/auth/use-form-alert';

import { profileFields, profileSchema, type ProfileValues } from './profile-schema';
import { SettingsSection } from './settings-section';

/** The name shown in the app; the sign-in email is shown but can't be changed here. */
function ProfileSection() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const alert = useFormAlert();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user?.full_name ?? '' },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      queryClient.setQueryData(sessionQueryKey, updated);
      // The saved value (trimmed by the server) replaces what was typed.
      form.reset({ full_name: updated.full_name });
      toast.success('Profile saved');
    },
    onError: (error) => alert.showOutcome(applyServerError(error, form.setError, profileFields)),
  });

  const submit = form.handleSubmit((values) => {
    alert.clear();
    save.mutate({ full_name: values.full_name });
  });

  return (
    <SettingsSection id="profile">
      {alert.message && <Alert className="max-w-prose">{alert.message}</Alert>}
      <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" error={errors.full_name?.message}>
            <Input autoComplete="name" {...form.register('full_name')} />
          </FormField>
          <FormField
            label="Email"
            description="The address you sign in with. It can’t be changed yet."
          >
            <Input
              type="email"
              readOnly
              value={user?.email ?? ''}
              autoComplete="email"
              spellCheck={false}
              autoCapitalize="none"
              className="bg-muted text-muted-foreground"
            />
          </FormField>
        </div>
        <div>
          <Button type="submit" variant="ink" disabled={save.isPending || alert.isWaiting}>
            {save.isPending
              ? 'Saving…'
              : alert.isWaiting
                ? `Try again in ${alert.waitSeconds}s`
                : 'Save profile'}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

export { ProfileSection };

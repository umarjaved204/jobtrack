import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { isApiError } from '@/lib/api/errors';

import { applyServerError } from './form-errors';
import { useSignIn } from './hooks';
import { type LoginValues, loginSchema } from './schemas';
import { useFormAlert } from './use-form-alert';

/** Sign-in form. On success goes to `next` (validated by the page with safeNextPath). */
function LoginForm({ next }: { next: string }) {
  const navigate = useNavigate();
  const signIn = useSignIn();
  const alert = useFormAlert();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    alert.clear();
    try {
      await signIn.mutateAsync(values);
      await navigate(next, { replace: true });
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        // One message for unknown email and wrong password (no account enumeration).
        alert.show(error.detail);
        form.resetField('password');
        form.setFocus('password');
        return;
      }
      alert.showOutcome(applyServerError(error, form.setError, ['email', 'password']));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5">
      {alert.message && <Alert>{alert.message}</Alert>}
      <FormField label="Email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          autoCapitalize="none"
          {...form.register('email')}
        />
      </FormField>
      <FormField label="Password" error={errors.password?.message}>
        <PasswordInput autoComplete="current-password" {...form.register('password')} />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting || alert.isWaiting} className="mt-1">
        {isSubmitting
          ? 'Signing in…'
          : alert.isWaiting
            ? `Try again in ${alert.waitSeconds}s`
            : 'Sign in'}
      </Button>
    </form>
  );
}

export { LoginForm };

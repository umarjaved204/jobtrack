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
import { useSignUp } from './hooks';
import { PASSWORD_MIN, type RegisterValues, registerSchema } from './schemas';
import { useFormAlert } from './use-form-alert';

/** Sign-up form. Creating an account also signs in; then goes to `next`. */
function RegisterForm({ next }: { next: string }) {
  const navigate = useNavigate();
  const signUp = useSignUp();
  const alert = useFormAlert();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    alert.clear();
    try {
      await signUp.mutateAsync(values);
      await navigate(next, { replace: true });
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        // "An account with this email already exists": it belongs on the email field.
        form.setError('email', { type: 'server', message: error.detail }, { shouldFocus: true });
        return;
      }
      alert.showOutcome(applyServerError(error, form.setError, ['full_name', 'email', 'password']));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5">
      {alert.message && <Alert>{alert.message}</Alert>}
      <FormField label="Full name" error={errors.full_name?.message}>
        <Input autoComplete="name" {...form.register('full_name')} />
      </FormField>
      <FormField label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </FormField>
      <FormField
        label="Password"
        description={`At least ${PASSWORD_MIN} characters. A short phrase is easier to remember.`}
        error={errors.password?.message}
      >
        <PasswordInput autoComplete="new-password" {...form.register('password')} />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting || alert.isWaiting} className="mt-1">
        {isSubmitting
          ? 'Creating your account…'
          : alert.isWaiting
            ? `Try again in ${alert.waitSeconds}s`
            : 'Create account'}
      </Button>
    </form>
  );
}

export { RegisterForm };

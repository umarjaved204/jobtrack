import { Slot } from 'radix-ui';
import { type ReactElement, type ReactNode, useId } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type FormFieldProps = {
  label: string;
  /** Shown under the control and announced with it (aria-describedby). */
  description?: ReactNode;
  /** Validation message; also marks the control aria-invalid. */
  error?: string;
  /** Exactly one form control (Input, Textarea, PasswordInput…). */
  children: ReactElement;
  className?: string;
};

/**
 * Label + control + hint + error, wired for assistive tech: the control gets a generated
 * `id`, `aria-invalid` and `aria-describedby` (hint, then error) through Radix Slot, so
 * any control works without its own plumbing:
 *
 *   <FormField label="Email" error={errors.email?.message}>
 *     <Input type="email" {...register('email')} />
 *   </FormField>
 */
function FormField({ label, description, error, children, className }: FormFieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div data-slot="form-field" className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Slot.Root
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      >
        {children}
      </Slot.Root>
      {description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export { FormField };

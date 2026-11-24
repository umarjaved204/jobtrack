import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { applyServerError } from '@/features/auth/form-errors';
import { useFormAlert } from '@/features/auth/use-form-alert';
import { resumesQuery } from '@/features/resumes/api';
import { ResumePicker } from '@/features/resumes/resume-picker';
import {
  type Application,
  type ApplicationStatus,
  applicationStatuses,
  statusLabels,
  workModeLabels,
  workModes,
} from '@/types/application';

import { useCreateApplication, useUpdateApplication } from './api';
import {
  applicationFormSchema,
  type ApplicationFormValues,
  emptyFormValues,
  formValuesFrom,
  toApplicationInput,
  toApplicationPatch,
} from './application-schema';
import { TagPicker } from './tag-picker';

export type ApplicationFormMode =
  { type: 'create'; status?: ApplicationStatus } | { type: 'edit'; application: Application };

type ApplicationFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ApplicationFormMode;
  onSaved?: (application: Application) => void;
};

const SOURCE_SUGGESTIONS = [
  'LinkedIn',
  'Company website',
  'Referral',
  'Recruiter',
  'Otta',
  'Indeed',
];
const FIELDS = Object.keys(emptyFormValues()) as (keyof ApplicationFormValues)[];

/**
 * Add or edit an application in a side panel (full width on phones), so the board or table
 * stays where it was.
 *
 * - Every way of closing (Escape, outside click, ×, Cancel) goes through one handler that
 *   asks before discarding unsaved changes.
 * - Focus returns to whatever opened the panel. Radix only refocuses a Dialog *Trigger*, and
 *   this panel is usually opened from code (a card, a menu item), so the opener is recorded.
 */
function ApplicationFormSheet({ open, onOpenChange, mode, onSaved }: ApplicationFormSheetProps) {
  const isDirty = useRef<() => boolean>(() => false);
  const opener = useRef<HTMLElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      opener.current = document.activeElement;
    }
  }, [open]);

  const requestClose = () => {
    if (isDirty.current()) setConfirmOpen(true);
    else onOpenChange(false);
  };

  const title = mode.type === 'create' ? 'Add an application' : `Edit ${mode.application.company}`;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:w-[36rem] sm:max-w-[36rem]"
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>Only the company and role are required.</SheetDescription>
          </SheetHeader>
          <ApplicationForm
            // Fresh form state for every open / application.
            key={mode.type === 'edit' ? mode.application.id : `new-${mode.status ?? ''}`}
            mode={mode}
            isDirtyRef={isDirty}
            onCancel={requestClose}
            onSaved={(application) => {
              onSaved?.(application);
              onOpenChange(false);
            }}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              {mode.type === 'create'
                ? 'This application hasn’t been saved yet.'
                : 'Your edits to this application haven’t been saved.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onOpenChange(false);
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApplicationForm({
  mode,
  isDirtyRef,
  onCancel,
  onSaved,
}: {
  mode: ApplicationFormMode;
  isDirtyRef: RefObject<() => boolean>;
  onCancel: () => void;
  onSaved: (application: Application) => void;
}) {
  const create = useCreateApplication();
  const update = useUpdateApplication(mode.type === 'edit' ? mode.application.id : '');
  const alert = useFormAlert();
  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues:
      mode.type === 'edit' ? formValuesFrom(mode.application) : emptyFormValues(mode.status),
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  useEffect(() => {
    // dirtyFields (read above, so React Hook Form tracks it) rather than isDirty, which is
    // only computed when read during render.
    isDirtyRef.current = () => Object.keys(form.formState.dirtyFields).length > 0;
  }, [form, isDirtyRef]);

  const onSubmit = form.handleSubmit(async (values) => {
    alert.clear();
    try {
      if (mode.type === 'create') {
        onSaved(await create.mutateAsync(toApplicationInput(values)));
        return;
      }
      const patch = toApplicationPatch(values, dirtyFields);
      onSaved(Object.keys(patch).length ? await update.mutateAsync(patch) : mode.application);
    } catch (error) {
      alert.showOutcome(applyServerError(error, form.setError, FIELDS));
    }
  });

  const field = (name: keyof ApplicationFormValues) => ({
    error: errors[name]?.message,
  });
  const currencyField = form.register('salary_currency');
  const resumes = useQuery(resumesQuery());
  const hasResumes = resumes.isPending || resumes.isError || resumes.data.length > 0;

  return (
    <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 py-5">
        {alert.message && <Alert>{alert.message}</Alert>}

        <FormField label="Company" {...field('company')}>
          <Input autoComplete="organization" {...form.register('company')} />
        </FormField>
        <FormField label="Role" {...field('role_title')}>
          <Input autoComplete="off" {...form.register('role_title')} />
        </FormField>
        <FormField label="Job link" {...field('job_url')}>
          <Input type="url" inputMode="url" placeholder="https://…" {...form.register('job_url')} />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Status" {...field('status')}>
            {(control) => (
              <Controller
                control={form.control}
                name="status"
                render={({ field: f }) => (
                  <Select name={f.name} value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger {...control} onBlur={f.onBlur} ref={f.ref}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {applicationStatuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {statusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FormField>
          <FormField label="Work mode" {...field('work_mode')}>
            {(control) => (
              <Controller
                control={form.control}
                name="work_mode"
                render={({ field: f }) => (
                  <Select name={f.name} value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger {...control} onBlur={f.onBlur} ref={f.ref}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {workModes.map((workMode) => (
                        <SelectItem key={workMode} value={workMode}>
                          {workModeLabels[workMode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FormField>
          <FormField label="Location" {...field('location')}>
            <Input placeholder="London, Remote (UK)…" {...form.register('location')} />
          </FormField>
          <FormField label="Source" description="Where you found the role." {...field('source')}>
            <Input list="application-sources" {...form.register('source')} />
          </FormField>
          <datalist id="application-sources">
            {SOURCE_SUGGESTIONS.map((source) => (
              <option key={source} value={source} />
            ))}
          </datalist>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">Salary (yearly)</legend>
          <div className="grid grid-cols-[1fr_1fr_6rem] gap-3">
            <FormField label="Minimum" {...field('salary_min')}>
              <Input inputMode="numeric" className="figures" {...form.register('salary_min')} />
            </FormField>
            <FormField label="Maximum" {...field('salary_max')}>
              <Input inputMode="numeric" className="figures" {...form.register('salary_max')} />
            </FormField>
            <FormField label="Currency" {...field('salary_currency')}>
              <Input
                maxLength={3}
                placeholder="GBP"
                autoCapitalize="characters"
                className="figures"
                {...currencyField}
                // A code, not a label: capitalise the value itself, not just how it looks.
                onChange={(event) => {
                  const upper = event.target.value.toUpperCase();
                  // Only when it changes: assigning moves the caret to the end.
                  if (upper !== event.target.value) event.target.value = upper;
                  return currencyField.onChange(event);
                }}
              />
            </FormField>
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Applied on"
            description="Filled in automatically when it leaves the wishlist."
            {...field('applied_on')}
          >
            <Input type="date" {...form.register('applied_on')} />
          </FormField>
          <FormField
            label="Apply by"
            description="The last day to apply, if the ad gives one."
            {...field('deadline_on')}
          >
            <Input type="date" {...form.register('deadline_on')} />
          </FormField>
        </div>

        <FormField
          label="Resume sent"
          description={
            hasResumes
              ? 'The version you sent, so you can see which one works best.'
              : 'No versions yet: add them on the Resumes page.'
          }
          {...field('resume_version_id')}
        >
          {(control) => (
            <Controller
              control={form.control}
              name="resume_version_id"
              render={({ field: f }) => (
                <ResumePicker
                  {...control}
                  name={f.name}
                  value={f.value}
                  onChange={f.onChange}
                  onBlur={f.onBlur}
                  ref={f.ref}
                  savedId={mode.type === 'edit' ? mode.application.resume_version_id : null}
                />
              )}
            />
          )}
        </FormField>

        <FormField label="Tags" {...field('tag_ids')}>
          {(control) => (
            <Controller
              control={form.control}
              name="tag_ids"
              render={({ field: f }) => (
                <TagPicker {...control} value={f.value} onChange={f.onChange} />
              )}
            />
          )}
        </FormField>
      </div>

      <div className="flex justify-end gap-2 border-t bg-popover px-5 py-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : mode.type === 'create' ? 'Add application' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

export { ApplicationFormSheet };

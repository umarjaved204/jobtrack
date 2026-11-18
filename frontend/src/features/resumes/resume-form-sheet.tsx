import { zodResolver } from '@hookform/resolvers/zod';
import { useLayoutEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { applyServerError } from '@/features/auth/form-errors';
import { useFormAlert } from '@/features/auth/use-form-alert';
import { cn } from '@/lib/utils';
import { isInUse, type Resume } from '@/types/resume';

import { useCreateResume, useUpdateResume } from './api';
import {
  MAX_RESUME_CHARS,
  normaliseResumeText,
  resumeFields,
  resumeFormSchema,
  type ResumeFormValues,
  resumeFormValues,
  toResumeInput,
  toResumePatch,
} from './resume-schema';
import { usageLabel } from './usage';

export type ResumeFormMode =
  /** `initial` pre-fills a duplicate. */
  { type: 'create'; initial?: ResumeFormValues } | { type: 'edit'; resume: Resume };

type ResumeFormSheetProps = {
  mode: ResumeFormMode | null;
  onClose: () => void;
  onSaved: (resume: Resume) => void;
};

const formatCount = (n: number) => n.toLocaleString('en-GB');

/**
 * Add, duplicate or edit a version in a wide side panel (full width on phones). Closing
 * with unsaved changes asks first: pasted resume text is easy to lose.
 */
function ResumeFormSheet({ mode, onClose, onSaved }: ResumeFormSheetProps) {
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const open = mode !== null;

  // Opened from code (a button, a menu item), so Radix can't return focus by itself.
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      opener.current = document.activeElement;
    }
  }, [open]);

  const requestClose = () => {
    if (dirty) setConfirmOpen(true);
    else onClose();
  };
  const title =
    mode?.type === 'edit'
      ? `Edit ${mode.resume.label}`
      : mode?.initial
        ? 'Duplicate as a new version'
        : 'Add a resume version';

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && requestClose()}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:w-[42rem] sm:max-w-[42rem]"
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              Paste the text as you sent it. Formatting isn’t kept, only the words.
            </SheetDescription>
          </SheetHeader>
          {mode && (
            <ResumeForm
              key={mode.type === 'edit' ? mode.resume.id : 'new'}
              mode={mode}
              onDirtyChange={setDirty}
              onCancel={requestClose}
              onSaved={(resume) => {
                setDirty(false);
                onSaved(resume);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              {mode?.type === 'edit'
                ? 'Your edits to this version haven’t been saved.'
                : 'This version hasn’t been saved yet.'}
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
                setDirty(false);
                onClose();
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

function ResumeForm({
  mode,
  onDirtyChange,
  onCancel,
  onSaved,
}: {
  mode: ResumeFormMode;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSaved: (resume: Resume) => void;
}) {
  const create = useCreateResume();
  const update = useUpdateResume();
  const alert = useFormAlert();
  const editing = mode.type === 'edit' ? mode.resume : null;
  const locked = editing !== null && isInUse(editing);
  const form = useForm<ResumeFormValues>({
    resolver: zodResolver(resumeFormSchema),
    defaultValues: editing
      ? resumeFormValues(editing)
      : (mode.type === 'create' && mode.initial) || resumeFormValues(),
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  const text = useWatch({ control: form.control, name: 'content_text' });
  const count = normaliseResumeText(text).length;
  const over = count > MAX_RESUME_CHARS;

  const onSubmit = form.handleSubmit(async (values) => {
    alert.clear();
    try {
      if (!editing) {
        onSaved(await create.mutateAsync(toResumeInput(values)));
        return;
      }
      const patch = toResumePatch(values, dirtyFields);
      onSaved(
        Object.keys(patch).length ? await update.mutateAsync({ id: editing.id, patch }) : editing,
      );
    } catch (error) {
      alert.showOutcome(applyServerError(error, form.setError, resumeFields));
    }
  });

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      onChange={() => onDirtyChange(true)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 py-5">
        {alert.message && <Alert>{alert.message}</Alert>}

        <FormField
          label="Name"
          description="How you’ll recognise it, like “Frontend, product focus”."
          error={errors.label?.message}
        >
          <Input autoComplete="off" {...form.register('label')} />
        </FormField>

        <FormField
          label="Resume text"
          description={
            editing && locked ? (
              `${usageLabel(editing)}, so the text is locked: it’s the record of what you sent. Duplicate it to change the text.`
            ) : (
              <span className={cn('figures', over && 'font-medium text-destructive')}>
                {formatCount(count)} of {formatCount(MAX_RESUME_CHARS)} characters
              </span>
            )
          }
          error={errors.content_text?.message}
        >
          <Textarea
            rows={18}
            readOnly={locked}
            spellCheck={!locked}
            className={cn('max-h-[60vh] min-h-72 leading-relaxed', locked && 'bg-muted')}
            {...form.register('content_text')}
          />
        </FormField>

        {!editing && (
          <div className="flex items-center gap-2">
            <Controller
              control={form.control}
              name="is_default"
              render={({ field }) => (
                <Checkbox
                  id="resume-is-default"
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);
                    onDirtyChange(true);
                  }}
                />
              )}
            />
            <Label htmlFor="resume-is-default" className="font-normal">
              Make this my default version
            </Label>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t bg-popover px-5 py-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || alert.isWaiting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add version'}
        </Button>
      </div>
    </form>
  );
}

export { ResumeFormSheet };

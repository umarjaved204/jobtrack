import { FileUp } from 'lucide-react';
import { type ChangeEvent, useId, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { buttonVariants } from '@/components/ui/variants';
import { cn } from '@/lib/utils';

import { importResumeFile } from './import/import-file';
import { normaliseResumeText } from './resume-schema';

/** What the picker offers; the file's first bytes decide what it really is. */
const ACCEPT = [
  '.pdf',
  '.docx',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

type Imported = { text: string; label: string };

type Status =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string }
  | { kind: 'done'; name: string }
  | { kind: 'refused'; message: string };

type ResumeFileImportProps = {
  /** The text box's current value: importing over typed text asks first. */
  currentText: () => string;
  onImported: (imported: Imported) => void;
};

/**
 * "Import from a file" for a new resume version. The file is read on this device (see
 * import/import-file.ts) and only fills the form: the user reviews the text, and only
 * what they save is stored. The status line is a live region, always rendered, so
 * progress, success and refusals are all announced.
 */
function ResumeFileImport({ currentText, onImported }: ResumeFileImportProps) {
  const hintId = useId();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [replacing, setReplacing] = useState<(Imported & { name: string }) | null>(null);
  const reading = status.kind === 'reading';

  const apply = (imported: Imported, name: string) => {
    onImported(imported);
    setStatus({ kind: 'done', name });
  };

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    // Picking a file isn't an edit by itself (the form marks itself dirty on change).
    event.stopPropagation();
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still reads it
    if (!file) return;

    setStatus({ kind: 'reading', name: file.name });
    const result = await importResumeFile(file);
    if (result.status === 'refused') {
      setStatus({ kind: 'refused', message: result.message });
      return;
    }
    const imported = { text: result.text, label: result.label };
    if (normaliseResumeText(currentText())) {
      setStatus({ kind: 'idle' });
      setReplacing({ ...imported, name: file.name });
    } else {
      apply(imported, file.name);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
            reading && 'pointer-events-none opacity-60',
          )}
        >
          <FileUp aria-hidden="true" />
          Import from a file
          <input
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={reading}
            aria-describedby={hintId}
            onChange={(event) => void onChange(event)}
          />
        </label>
        <p id={hintId} className="text-sm text-muted-foreground">
          PDF or Word (.docx), up to 5 MB. It’s read on this device, never uploaded.
        </p>
      </div>
      <p
        role="status"
        className={cn(
          'text-sm empty:hidden',
          status.kind === 'refused' ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        {statusText(status)}
      </p>

      <ConfirmDialog
        open={replacing !== null}
        onOpenChange={(open) => !open && setReplacing(null)}
        title="Replace the text you’ve entered?"
        description={
          replacing ? `The text from ${replacing.name} will replace what’s in the box now.` : ''
        }
        confirmLabel="Replace the text"
        cancelLabel="Keep my text"
        onConfirm={() => {
          if (replacing) apply(replacing, replacing.name);
          setReplacing(null);
        }}
      />
    </div>
  );
}

function statusText(status: Status): string {
  switch (status.kind) {
    case 'idle':
      return '';
    case 'reading':
      return `Reading ${status.name}…`;
    case 'done':
      return `Filled in the text from ${status.name}. Check it before saving: columns and tables can come out in the wrong order.`;
    case 'refused':
      return status.message;
  }
}

export { ResumeFileImport };

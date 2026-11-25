import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import { saveFile } from '@/lib/save-file';

type ExportFormat = 'json' | 'csv';

const FORMATS: Record<ExportFormat, { label: string; hint: string; fallbackName: string }> = {
  csv: {
    label: 'Download CSV',
    hint: 'A zip of spreadsheets, one per table.',
    fallbackName: 'jobtrack-export.zip',
  },
  json: {
    label: 'Download JSON',
    hint: 'One file, for backups and scripts.',
    fallbackName: 'jobtrack-export.json',
  },
};

/** Downloads everything the user has entered (GET /export) as CSV or JSON. */
function ExportSection() {
  const exportData = useMutation({
    mutationFn: async (format: ExportFormat) => {
      const { blob, filename } = await api.download(`/export?format=${format}`);
      const name = filename ?? FORMATS[format].fallbackName;
      saveFile(blob, name);
      return name;
    },
    onSuccess: (name) => toast.success(`Downloaded ${name}`),
  });

  return (
    <section aria-labelledby="export-heading" className="grid gap-3 border-t border-rule pt-6">
      <h2 id="export-heading" className="font-display text-xl font-semibold">
        Export your data
      </h2>
      <p className="max-w-prose text-muted-foreground">
        Everything you’ve entered: applications with their contacts, notes and status history, tags,
        resume versions, reminders and calendar events. Match results aren’t included.
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-4">
        {(Object.keys(FORMATS) as ExportFormat[]).map((format) => {
          const { label, hint } = FORMATS[format];
          const pending = exportData.isPending && exportData.variables === format;
          return (
            <li key={format} className="grid content-start gap-1.5">
              <div>
                <Button
                  variant="outline"
                  aria-describedby={`export-${format}-hint`}
                  disabled={exportData.isPending}
                  onClick={() => exportData.mutate(format)}
                >
                  <Download aria-hidden="true" />
                  {pending ? 'Preparing…' : label}
                </Button>
              </div>
              <p id={`export-${format}-hint`} className="text-sm text-muted-foreground">
                {hint}
              </p>
            </li>
          );
        })}
      </ul>
      {exportData.isError && (
        <Alert title="The export didn’t download" className="max-w-prose">
          {isApiError(exportData.error)
            ? exportData.error.detail
            : 'Something went wrong. Try again.'}
        </Alert>
      )}
    </section>
  );
}

export { ExportSection };

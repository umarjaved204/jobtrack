import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import type { Application } from '@/types/application';
import type { ResumeSummary } from '@/types/resume';

import {
  MAX_JD_CHARS,
  matchFields,
  matchFormSchema,
  type MatchFormValues,
  NO_APPLICATION,
  normaliseJdText,
} from './match-schema';

const formatCount = (n: number) => n.toLocaleString('en-GB');

type MatchFormProps = {
  /** Active versions only; the default is picked first. */
  resumes: ResumeSummary[];
  /** Undefined while loading. */
  applications: Application[] | undefined;
  /** A run is in progress: the fields are locked so the result matches what's shown. */
  running: boolean;
  /** The last run's failure: a 422 on a field lands on that field. */
  error: unknown;
  onRun: (values: MatchFormValues) => void;
};

function MatchForm({ resumes, applications, running, error, onRun }: MatchFormProps) {
  const form = useForm<MatchFormValues>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: {
      resume_id: (resumes.find((r) => r.is_default) ?? resumes[0])?.id ?? '',
      application_id: NO_APPLICATION,
      jd_text: '',
    },
  });
  const { errors } = form.formState;
  const text = useWatch({ control: form.control, name: 'jd_text' });
  const count = normaliseJdText(text).length;
  const over = count > MAX_JD_CHARS;

  useEffect(() => {
    if (!isApiError(error) || error.status !== 422) return;
    const known = matchFields.filter((field) => field in error.fieldErrors);
    known.forEach((field, index) =>
      form.setError(
        field,
        { type: 'server', message: error.fieldErrors[field] },
        { shouldFocus: index === 0 },
      ),
    );
  }, [error, form]);

  return (
    <form noValidate onSubmit={form.handleSubmit(onRun)} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="resume_id"
          render={({ field }) => (
            <FormField label="Resume" error={errors.resume_id?.message}>
              {(control) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={running}>
                  <SelectTrigger {...control} onBlur={field.onBlur} ref={field.ref}>
                    <SelectValue placeholder="Pick a version" />
                  </SelectTrigger>
                  <SelectContent>
                    {resumes.map((resume) => (
                      <SelectItem key={resume.id} value={resume.id}>
                        {resume.label}
                        {resume.is_default && (
                          <>
                            {' '}
                            <span className="text-muted-foreground">(default)</span>
                          </>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}
        />

        <Controller
          control={form.control}
          name="application_id"
          render={({ field }) => (
            <FormField
              label="Application"
              description="Optional: keeps the result with the job you’re applying for."
            >
              {(control) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={running || applications === undefined}
                >
                  <SelectTrigger {...control} onBlur={field.onBlur} ref={field.ref}>
                    <SelectValue placeholder="Loading applications…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_APPLICATION}>Not linked</SelectItem>
                    {applications?.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.company}
                        <span className="text-muted-foreground"> · {app.role_title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}
        />
      </div>

      <FormField
        label="Job description"
        description={
          <span className={cn('figures', over && 'font-medium text-destructive')}>
            {formatCount(count)} of {formatCount(MAX_JD_CHARS)} characters
          </span>
        }
        error={errors.jd_text?.message}
      >
        <Textarea
          rows={14}
          readOnly={running}
          placeholder="Paste the whole advert: the role, requirements and nice-to-haves."
          className="max-h-[60vh] min-h-64 leading-relaxed"
          {...form.register('jd_text')}
        />
      </FormField>

      <div>
        <Button type="submit" size="lg" disabled={running}>
          {running ? 'Matching…' : 'Match'}
        </Button>
      </div>
    </form>
  );
}

export { MatchForm };

import { useQuery } from '@tanstack/react-query';
import type { Ref } from 'react';

import type { FieldControlProps } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NO_RESUME } from '@/features/applications/application-schema';

import { resumesQuery } from './api';

type ResumePickerProps = FieldControlProps & {
  /** The form field's name: Radix gives it to the hidden native select inside a form. */
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLButtonElement>;
  /** The version already saved on the application: still offered if it's been archived. */
  savedId?: string | null;
};

/**
 * "Resume sent": active versions (the default first), or none. Archived versions are hidden,
 * except the one this application already used, which stays selectable and says so.
 */
function ResumePicker({
  name,
  value,
  onChange,
  onBlur,
  ref,
  savedId,
  ...control
}: ResumePickerProps) {
  const resumes = useQuery(resumesQuery());
  const options = (resumes.data ?? []).filter((r) => !r.archived_at || r.id === savedId);

  return (
    <Select name={name} value={value} onValueChange={onChange} disabled={resumes.isPending}>
      <SelectTrigger {...control} onBlur={onBlur} ref={ref}>
        <SelectValue placeholder={resumes.isPending ? 'Loading versions…' : undefined} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_RESUME}>None</SelectItem>
        {options.map((resume) => (
          <SelectItem key={resume.id} value={resume.id}>
            {resume.label}
            {resume.is_default && (
              <>
                {' '}
                <span className="text-muted-foreground">(default)</span>
              </>
            )}
            {resume.archived_at && (
              <>
                {' '}
                <span className="text-muted-foreground">(archived)</span>
              </>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { ResumePicker };

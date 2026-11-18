/*
 * GET/POST/PATCH /resumes shapes. Mirror backend/app/schemas/resume.py. The rules
 * (backend/app/services/resumes.py): a version that's been used (sent with an
 * application, or used by a match) keeps its text and can't be deleted, only archived;
 * archived versions can't be the default; at most one default.
 */

/** List item: everything except the text. */
export type ResumeSummary = {
  id: string;
  label: string;
  is_default: boolean;
  /** ISO timestamp; null while active. */
  archived_at: string | null;
  char_count: number;
  application_count: number;
  match_count: number;
  created_at: string;
  updated_at: string;
};

export type Resume = ResumeSummary & { content_text: string };

export type ResumeInput = { label: string; content_text: string; is_default?: boolean };

/** PATCH: only sent fields change. */
export type ResumePatch = {
  label?: string;
  content_text?: string;
  is_default?: boolean;
  archived?: boolean;
};

/** Sent with an application or used by a match: the text is frozen. */
export const isInUse = (resume: ResumeSummary) => resume.application_count + resume.match_count > 0;

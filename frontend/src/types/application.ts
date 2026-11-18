/**
 * Application status, in pipeline order. Mirrors the backend `ApplicationStatus`
 * StrEnum (backend/app/models/enums.py); the API returns these exact strings.
 */
export const applicationStatuses = [
  'wishlist',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const statusLabels: Record<ApplicationStatus, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

// ---------------------------------------------------------------- API shapes
// Mirror backend/app/schemas/{application,contact,tag,common}.py. Dates are plain
// "YYYY-MM-DD" strings (see src/lib/dates.ts); timestamps are ISO 8601 with offset.

export const workModes = ['remote', 'hybrid', 'onsite'] as const;
export type WorkMode = (typeof workModes)[number];

export const workModeLabels: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

/** "YYYY-MM-DD" calendar date, no time or zone. */
export type DateOnly = string;

export type Tag = { id: string; name: string; color: string };

export type Application = {
  id: string;
  company: string;
  role_title: string;
  location: string | null;
  work_mode: WorkMode | null;
  job_url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  source: string | null;
  status: ApplicationStatus;
  /** Kanban order within the status column (floats, midpoint insertion). */
  position: number;
  applied_on: DateOnly | null;
  deadline_on: DateOnly | null;
  resume_version_id: string | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
};

/** POST /applications body. */
export type ApplicationInput = {
  company: string;
  role_title: string;
  location?: string | null;
  work_mode?: WorkMode | null;
  job_url?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  source?: string | null;
  status?: ApplicationStatus;
  applied_on?: DateOnly | null;
  deadline_on?: DateOnly | null;
  /** The resume version sent. Must be the user's own and not archived (unless unchanged). */
  resume_version_id?: string | null;
  tag_ids?: string[];
};

/** PATCH /applications/{id}: only sent fields change; null clears optional ones. */
export type ApplicationPatch = Partial<ApplicationInput>;

export type BoardColumn = { status: ApplicationStatus; applications: Application[] };
export type Board = { columns: BoardColumn[] };

export type Page<T> = { items: T[]; total: number; page: number; page_size: number; pages: number };

export const applicationSorts = [
  '-created_at',
  'created_at',
  '-applied_on',
  'applied_on',
  '-updated_at',
  'company',
  '-company',
  'deadline_on',
] as const;
export type ApplicationSort = (typeof applicationSorts)[number];

/** GET /applications query. Arrays become repeated params (?status=a&status=b). */
export type ApplicationFilters = {
  q?: string;
  status?: ApplicationStatus[];
  source?: string[];
  tag?: string[];
  from?: DateOnly;
  to?: DateOnly;
  sort?: ApplicationSort;
  page?: number;
  page_size?: number;
};

export type ApplicationEvent = {
  id: string;
  type: 'status_change' | 'note';
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus | null;
  body: string | null;
  created_at: string;
};

export type Contact = {
  id: string;
  application_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notes: string | null;
};

export type ContactInput = Omit<Contact, 'id' | 'application_id'>;

import { delay } from 'msw';
import { http, HttpResponse } from 'msw/http';

import { todayDateOnly } from '@/lib/dates';
import {
  type Application,
  type ApplicationEvent,
  type ApplicationInput,
  type ApplicationStatus,
  applicationStatuses,
  type Contact,
  type Tag,
} from '@/types/application';
import type { CalendarEvent, CalendarEventInput, CalendarItem } from '@/types/calendar';
import type { Reminder, ReminderInput, ReminderPatch } from '@/types/reminder';
import { decodeVectors } from '@/features/match/encode-vectors';
import type { EmbeddingsMode, Match, MatchInput } from '@/types/match';
import type { Resume, ResumeInput, ResumePatch } from '@/types/resume';

import { server } from './msw';

/*
 * A stateful in-memory fake of the applications, tags, timeline and contacts endpoints,
 * following the backend's rules (backend/app/services/applications.py):
 * - new cards and status changes go to the end of their column (positions 1024 apart);
 * - leaving the wishlist fills applied_on with today if it's empty;
 * - every status change appends a status_change event (and creation logs the first one);
 * - everything requires a bearer token; unknown ids are 404;
 * - resume versions (backend/app/services/resumes.py): used ones keep their text and
 *   can't be deleted (409), archived ones can't be the default (409) or be newly linked
 *   (422), and usage counts come from the applications here;
 * - reminders (backend/app/services/reminders.py): exactly one of due_on / due_at, links
 *   only to existing applications (404), deleted with their application;
 * - calendar events and GET /calendar (backend/app/services/calendar.py): events by
 *   overlap with [from, to); apply-by dates (wishlist only) and all-day reminders by the
 *   local days of the offsets sent; open reminders unless include_done.
 * - the AI match (backend/app/services/match/service.py): `matchEmbeddings` picks the
 *   mode; off is 503; client mode needs prepare's digest back (409 if the texts changed)
 *   and one vector row per chunk (422); server mode refuses prepare and vectors (422);
 *   archived resumes can't be matched (422); a saved match freezes its resume (match_count),
 *   and `DELETE /match` (works in every mode) unfreezes it unless an application links it.
 *   Chunks are the texts' non-empty lines (the server also splits long lines and skips JD
 *   headings and ignored sections), and the score is a word overlap, not the real one.
 * Combine with `mockAuthBackend({ signedIn: true })` so the client has a token.
 */

const STEP = 1024;
let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;
const nowIso = () => new Date().toISOString();

export function makeApplication(overrides: Partial<Application> = {}): Application {
  const created = nowIso();
  return {
    id: nextId('app'),
    company: 'Monzo',
    role_title: 'Senior Frontend Engineer',
    location: 'London',
    work_mode: 'hybrid',
    job_url: 'https://jobs.example.org/monzo/4821',
    salary_min: 75_000,
    salary_max: 90_000,
    salary_currency: 'GBP',
    source: 'LinkedIn',
    status: 'applied',
    position: STEP,
    applied_on: '2026-11-03',
    deadline_on: null,
    resume_version_id: null,
    tags: [],
    created_at: created,
    updated_at: created,
    ...overrides,
  };
}

/** A small, realistic pipeline: one card in most columns. */
export function sampleApplications(): Application[] {
  return [
    makeApplication({ company: 'Figma', role_title: 'Design Systems Engineer', status: 'wishlist', applied_on: null, deadline_on: '2026-11-28' }),
    makeApplication({ company: 'Monzo', status: 'applied', position: STEP }),
    makeApplication({ company: 'Wise', role_title: 'Frontend Engineer, Payments', status: 'applied', position: 2 * STEP, source: 'Referral' }),
    makeApplication({ company: 'Octopus Energy', role_title: 'Product Engineer', status: 'screening' }),
    makeApplication({ company: 'Deliveroo', role_title: 'Full-stack Engineer', status: 'interview' }),
    makeApplication({ company: 'Starling Bank', role_title: 'React Developer', status: 'rejected', applied_on: '2026-10-12' }),
  ]; // prettier-ignore
}

export function makeResume(overrides: Partial<Resume> = {}): Resume {
  const created = nowIso();
  const content_text =
    overrides.content_text ?? 'Sam Okafor\nFrontend engineer\n\nReact, TypeScript, Playwright';
  return {
    id: nextId('resume'),
    label: 'Frontend v1',
    is_default: false,
    archived_at: null,
    application_count: 0,
    match_count: 0,
    created_at: created,
    updated_at: created,
    ...overrides,
    content_text,
    char_count: content_text.length,
  };
}

export const FAKE_MATCH_MODEL = {
  id: 'Xenova/bge-small-en-v1.5',
  revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
  dtype: 'q8',
  dim: 384,
} as const;

export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: nextId('match'),
    score: 72,
    resume_version_id: 'resume-0',
    resume_label: 'Frontend v1',
    application_id: null,
    company: null,
    role_title: null,
    jd_excerpt: 'Senior Frontend Engineer, Monzo',
    is_current: true,
    created_at: nowIso(),
    jd_text: 'Senior Frontend Engineer, Monzo\n\nRequirements:\n- React and TypeScript\n- GraphQL',
    skill_coverage: 0.67,
    semantic_score: 0.8,
    matched_skills: [
      { skills: ['React'], label: 'React', required: true },
      { skills: ['TypeScript'], label: 'TypeScript', required: true },
    ],
    missing_skills: [{ skills: ['GraphQL'], label: 'GraphQL', required: true }],
    suggested_keywords: ['GraphQL'],
    evidence: [
      {
        jd_text: 'React and TypeScript',
        resume_text: 'React, TypeScript, Playwright',
        similarity: 0.83,
      },
    ],
    sections_detected: true,
    model_name: `${FAKE_MATCH_MODEL.id}@${FAKE_MATCH_MODEL.revision}`,
    scoring_version: 1,
    calibration_version: 1,
    taxonomy_version: 1,
    ...overrides,
  };
}

/** A stored reminder: like the API's, but holding the application id (the ref is derived). */
export type StoredReminder = Omit<Reminder, 'application'> & { application_id: string | null };

/** Exactly one of due_on / due_at, like the API: passing `due_at` makes it timed. */
export function makeReminder(overrides: Partial<StoredReminder> = {}): StoredReminder {
  return {
    id: nextId('reminder'),
    title: 'Follow up with the recruiter',
    application_id: null,
    due_on: overrides.due_at ? null : '2026-11-20',
    due_at: null,
    done_at: null,
    ...overrides,
  };
}

/** A stored event: like the API's, but holding the application id. */
export type StoredEvent = Omit<CalendarEvent, 'application'> & { application_id: string | null };

export function makeEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: nextId('event'),
    kind: 'interview',
    title: 'Technical interview',
    starts_at: '2026-11-20T15:00:00.000Z',
    ends_at: null,
    location_or_link: null,
    application_id: null,
    ...overrides,
  };
}

type State = {
  applications: Application[];
  events: Map<string, ApplicationEvent[]>;
  contacts: Contact[];
  tags: Tag[];
  resumes: Resume[];
  reminders: StoredReminder[];
  calendarEvents: StoredEvent[];
  matches: Match[];
  matchEmbeddings: EmbeddingsMode;
  calls: string[];
};

const unauthorized = () => HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 });
const notFound = (what = 'Application') =>
  HttpResponse.json({ detail: `${what} not found` }, { status: 404 });
const hasToken = (request: Request) =>
  request.headers.get('Authorization')?.startsWith('Bearer ') ?? false;

export function mockApplicationsBackend({
  applications = sampleApplications(),
  tags = [],
  contacts = [],
  resumes = [],
  reminders = [],
  calendarEvents = [],
  matches = [],
  matchEmbeddings = 'client',
  moveLatencyMs = 0,
  failMovesFor = [],
  boardLatencyMs = 0,
}: {
  applications?: Application[];
  tags?: Tag[];
  contacts?: Contact[];
  resumes?: Resume[];
  reminders?: StoredReminder[];
  calendarEvents?: StoredEvent[];
  matches?: Match[];
  matchEmbeddings?: EmbeddingsMode;
  /** Keep move requests in flight this long (per card id, or for all). */
  moveLatencyMs?: number | ((id: string) => number);
  /** Card ids whose moves fail with 503 (after their latency). */
  failMovesFor?: string[];
  /** Delay board responses (to observe the UI before a refetch lands). */
  boardLatencyMs?: number;
} = {}) {
  const state: State = {
    applications: applications.map((a) => ({ ...a })),
    events: new Map(),
    contacts: contacts.map((c) => ({ ...c })),
    tags: tags.map((t) => ({ ...t })),
    resumes: resumes.map((r) => ({ ...r })),
    reminders: reminders.map((r) => ({ ...r })),
    calendarEvents: calendarEvents.map((e) => ({ ...e })),
    matches: matches.map((m) => ({ ...m })),
    matchEmbeddings,
    calls: [],
  };
  for (const a of state.applications) {
    state.events.set(a.id, [statusEvent(null, a.status, a.created_at)]);
  }

  function statusEvent(
    from: ApplicationStatus | null,
    to: ApplicationStatus,
    at = nowIso(),
  ): ApplicationEvent {
    return { id: nextId('evt'), type: 'status_change', from_status: from, to_status: to, body: null, created_at: at };
  } // prettier-ignore

  const find = (id: string) => state.applications.find((a) => a.id === id);
  const endOfColumn = (status: ApplicationStatus) =>
    Math.max(0, ...state.applications.filter((a) => a.status === status).map((a) => a.position)) +
    STEP;
  const resolveTags = (ids: string[] = []) => state.tags.filter((t) => ids.includes(t.id));

  /** Like the API's response: counts come from the applications that link to it. */
  const withUsage = (resume: Resume): Resume => ({
    ...resume,
    application_count: state.applications.filter((a) => a.resume_version_id === resume.id).length,
    char_count: resume.content_text.length,
  });
  /** The list leaves the text out, like the API. */
  const resumeSummary = (resume: Resume): Omit<Resume, 'content_text'> => {
    const summary: Partial<Resume> = withUsage(resume);
    delete summary.content_text;
    return summary as Omit<Resume, 'content_text'>;
  };
  const inUse = (resume: Resume) => {
    const used = withUsage(resume);
    return used.application_count + used.match_count > 0;
  };
  const error = (status: number, detail: string) => HttpResponse.json({ detail }, { status });

  const ref = (id: string | null) => {
    const app = id ? find(id) : undefined;
    return app ? { id: app.id, company: app.company, role_title: app.role_title } : null;
  };
  const eventRead = ({ application_id, ...rest }: StoredEvent): CalendarEvent => ({
    ...rest,
    application: ref(application_id),
  });
  /** The calendar day a "…T00:00:00±hh:mm" bound names, and the last day before `to`. */
  const dayBounds = (from: string, to: string) => {
    const toMidnight = to.slice(11, 19) === '00:00:00';
    const last = new Date(`${to.slice(0, 10)}T12:00:00Z`);
    if (toMidnight) last.setUTCDate(last.getUTCDate() - 1);
    return [from.slice(0, 10), last.toISOString().slice(0, 10)] as const;
  };

  /** API shape: the application id becomes a ref {id, company, role_title}. */
  const reminderRead = ({ application_id, ...rest }: StoredReminder): Reminder => {
    const app = application_id ? find(application_id) : undefined;
    return {
      ...rest,
      application: app ? { id: app.id, company: app.company, role_title: app.role_title } : null,
    };
  };
  /** Like the API's order: open ones by due (UTC) day, all-day first; done ones newest first. */
  const dueKey = (r: StoredReminder) => `${r.due_on ?? r.due_at?.slice(0, 10)} ${r.due_at ?? ''}`;
  const reminderOrder = (a: StoredReminder, b: StoredReminder) =>
    Number(Boolean(a.done_at)) - Number(Boolean(b.done_at)) ||
    (b.done_at ?? '').localeCompare(a.done_at ?? '') ||
    dueKey(a).localeCompare(dueKey(b));
  /** A newly linked resume must exist and not be archived (an unchanged link is fine). */
  function resumeLinkError(id: string | null | undefined, current: string | null = null) {
    if (!id || id === current) return null;
    const resume = state.resumes.find((r) => r.id === id);
    if (!resume) return error(422, 'Resume version does not exist');
    if (resume.archived_at) return error(422, 'Resume version is archived');
    return null;
  }

  function changeStatus(app: Application, to: ApplicationStatus) {
    if (app.status === to) return;
    state.events.get(app.id)?.push(statusEvent(app.status, to));
    app.status = to;
    if (to !== 'wishlist' && !app.applied_on) app.applied_on = todayDateOnly();
  }

  server.use(
    http.get('/api/v1/tags', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('GET /tags');
      return HttpResponse.json([...state.tags].sort((a, b) => a.name.localeCompare(b.name)));
    }),
    http.post('/api/v1/tags', async ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('POST /tags');
      const body = (await request.json()) as { name: string; color?: string };
      const name = body.name.trim();
      if (state.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
        return HttpResponse.json(
          { detail: 'A tag with this name already exists' },
          { status: 409 },
        );
      }
      const tag = { id: nextId('tag'), name, color: body.color ?? 'ink' };
      state.tags.push(tag);
      return HttpResponse.json(tag, { status: 201 });
    }),

    http.get('/api/v1/applications/board', async ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('GET /board');
      if (boardLatencyMs) await delay(boardLatencyMs);
      return HttpResponse.json({
        columns: applicationStatuses.map((status) => ({
          status,
          applications: state.applications
            .filter((a) => a.status === status)
            .sort((a, b) => a.position - b.position),
        })),
      });
    }),
    http.get('/api/v1/applications', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('GET /applications');
      const params = new URL(request.url).searchParams;
      const q = params.get('q')?.toLowerCase();
      const statuses = params.getAll('status');
      const sources = params.getAll('source').map((s) => s.toLowerCase());
      const tagIds = params.getAll('tag');
      const from = params.get('from');
      const to = params.get('to');
      const page = Number(params.get('page') ?? 1);
      const pageSize = Number(params.get('page_size') ?? 20);
      const sort = params.get('sort') ?? '-created_at';

      const filtered = state.applications.filter(
        (a) =>
          (!q || `${a.company} ${a.role_title}`.toLowerCase().includes(q)) &&
          (!statuses.length || statuses.includes(a.status)) &&
          (!sources.length || sources.includes((a.source ?? '').toLowerCase())) &&
          (!tagIds.length || a.tags.some((t) => tagIds.includes(t.id))) &&
          (!from || (a.applied_on !== null && a.applied_on >= from)) &&
          (!to || (a.applied_on !== null && a.applied_on <= to)),
      );
      // Like the API: empty dates sort last in either direction; ties keep insertion order.
      const field = sort.replace(/^-/, '') as keyof Application;
      const direction = sort.startsWith('-') ? -1 : 1;
      filtered.sort((a, b) => {
        const [x, y] = [a[field], b[field]];
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        return direction * String(x).localeCompare(String(y));
      });
      const start = (page - 1) * pageSize;
      return HttpResponse.json({
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        page_size: pageSize,
        pages: Math.ceil(filtered.length / pageSize), // like the API: 0 when nothing matches
      });
    }),
    http.post('/api/v1/applications', async ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('POST /applications');
      const { tag_ids, ...input } = (await request.json()) as ApplicationInput;
      const linkError = resumeLinkError(input.resume_version_id);
      if (linkError) return linkError;
      const status = input.status ?? 'wishlist';
      const app = makeApplication({
        location: null,
        work_mode: null,
        job_url: null,
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        source: null,
        applied_on: null,
        deadline_on: null,
        ...input,
        status,
        position: endOfColumn(status),
        tags: resolveTags(tag_ids),
      });
      if (status !== 'wishlist' && !app.applied_on) app.applied_on = todayDateOnly();
      state.applications.push(app);
      state.events.set(app.id, [statusEvent(null, status)]);
      return HttpResponse.json(app, { status: 201 });
    }),
    http.get('/api/v1/applications/:id', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const app = find(String(params['id']));
      return app ? HttpResponse.json(app) : notFound();
    }),
    http.patch('/api/v1/applications/:id', async ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('PATCH /applications');
      const app = find(String(params['id']));
      if (!app) return notFound();
      const { tag_ids, status, ...patch } = (await request.json()) as ApplicationInput;
      const linkError = resumeLinkError(patch.resume_version_id, app.resume_version_id);
      if (linkError) return linkError;
      Object.assign(app, patch, { updated_at: nowIso() });
      if (tag_ids) app.tags = resolveTags(tag_ids);
      if (status && status !== app.status) {
        app.position = endOfColumn(status);
        changeStatus(app, status);
      }
      return HttpResponse.json(app);
    }),
    http.delete('/api/v1/applications/:id', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const id = String(params['id']);
      if (!find(id)) return notFound();
      state.calls.push('DELETE /applications');
      state.applications = state.applications.filter((a) => a.id !== id);
      state.contacts = state.contacts.filter((c) => c.application_id !== id);
      state.reminders = state.reminders.filter((r) => r.application_id !== id); // cascade
      state.calendarEvents = state.calendarEvents.filter((e) => e.application_id !== id); // cascade
      state.events.delete(id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/v1/applications/:id/move', async ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('POST /move');
      const id = String(params['id']);
      const latency = typeof moveLatencyMs === 'function' ? moveLatencyMs(id) : moveLatencyMs;
      if (latency) await delay(latency);
      if (failMovesFor.includes(id)) {
        return HttpResponse.json({ detail: 'Database unavailable' }, { status: 503 });
      }
      const app = find(id);
      if (!app) return notFound();
      const move = (await request.json()) as { status: ApplicationStatus; position: number };
      app.position = move.position;
      changeStatus(app, move.status);
      return HttpResponse.json(app);
    }),
    http.get('/api/v1/applications/:id/events', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const events = state.events.get(String(params['id']));
      if (!events) return notFound();
      return HttpResponse.json([...events].reverse()); // newest first, like the API
    }),
    http.post('/api/v1/applications/:id/events', async ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const events = state.events.get(String(params['id']));
      if (!events) return notFound();
      const { body } = (await request.json()) as { body: string };
      const note: ApplicationEvent = {
        id: nextId('evt'),
        type: 'note',
        from_status: null,
        to_status: null,
        body: body.trim(),
        created_at: nowIso(),
      };
      events.push(note);
      return HttpResponse.json(note, { status: 201 });
    }),
    http.get('/api/v1/applications/:id/contacts', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const id = String(params['id']);
      if (!find(id)) return notFound();
      return HttpResponse.json(
        state.contacts
          .filter((c) => c.application_id === id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    }),
    http.post('/api/v1/applications/:id/contacts', async ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const id = String(params['id']);
      if (!find(id)) return notFound();
      const input = (await request.json()) as Partial<Contact>;
      const contact: Contact = {
        id: nextId('contact'),
        application_id: id,
        name: '',
        role: null,
        email: null,
        phone: null,
        linkedin_url: null,
        notes: null,
        ...input,
      };
      state.contacts.push(contact);
      return HttpResponse.json(contact, { status: 201 });
    }),
    http.patch('/api/v1/contacts/:id', async ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const contact = state.contacts.find((c) => c.id === String(params['id']));
      if (!contact) return notFound('Contact');
      Object.assign(contact, (await request.json()) as Partial<Contact>);
      return HttpResponse.json(contact);
    }),
    http.delete('/api/v1/contacts/:id', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const id = String(params['id']);
      if (!state.contacts.some((c) => c.id === id)) return notFound('Contact');
      state.contacts = state.contacts.filter((c) => c.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('/api/v1/reminders', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('GET /reminders');
      const params = new URL(request.url).searchParams;
      const status = params.get('status') ?? 'open';
      const applicationId = params.get('application_id');
      const listed = state.reminders.filter(
        (r) =>
          (status === 'all' || (status === 'done') === Boolean(r.done_at)) &&
          (!applicationId || r.application_id === applicationId),
      );
      return HttpResponse.json([...listed].sort(reminderOrder).map(reminderRead));
    }),
    http.post('/api/v1/reminders', async ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('POST /reminders');
      const input = (await request.json()) as ReminderInput;
      if (Boolean(input.due_on) === Boolean(input.due_at)) {
        return error(422, 'Send exactly one of due_on (all day) or due_at (timed)');
      }
      if (input.application_id && !find(input.application_id)) return notFound();
      const reminder = makeReminder({
        title: input.title.trim(),
        application_id: input.application_id ?? null,
        due_on: input.due_on ?? null,
        due_at: input.due_at ? new Date(input.due_at).toISOString() : null,
      });
      state.reminders.push(reminder);
      return HttpResponse.json(reminderRead(reminder), { status: 201 });
    }),
    http.patch('/api/v1/reminders/:id', async ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('PATCH /reminders');
      const reminder = state.reminders.find((r) => r.id === String(params['id']));
      if (!reminder) return notFound('Reminder');
      const patch = (await request.json()) as ReminderPatch;
      if (patch.application_id && !find(patch.application_id)) return notFound();
      if (patch.title !== undefined) reminder.title = patch.title.trim();
      if (patch.application_id !== undefined) reminder.application_id = patch.application_id;
      if (patch.due_on) Object.assign(reminder, { due_on: patch.due_on, due_at: null });
      if (patch.due_at) {
        Object.assign(reminder, { due_on: null, due_at: new Date(patch.due_at).toISOString() });
      }
      if (patch.done === true) reminder.done_at ??= nowIso();
      if (patch.done === false) reminder.done_at = null;
      return HttpResponse.json(reminderRead(reminder));
    }),
    http.delete('/api/v1/reminders/:id', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const id = String(params['id']);
      if (!state.reminders.some((r) => r.id === id)) return notFound('Reminder');
      state.calls.push('DELETE /reminders');
      state.reminders = state.reminders.filter((r) => r.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('/api/v1/calendar', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      const params = new URL(request.url).searchParams;
      const [from, to] = [params.get('from') ?? '', params.get('to') ?? ''];
      state.calls.push(`GET /calendar?from=${from}&to=${to}`);
      const [start, end] = [Date.parse(from), Date.parse(to)];
      if (!(end > start)) return error(422, "'to' must be after 'from'");
      const [firstDay, lastDay] = dayBounds(from, to);
      const inDays = (day: string | null) => day !== null && day >= firstDay && day <= lastDay;
      const items: CalendarItem[] = [
        ...state.calendarEvents
          .filter((e) => {
            const s = Date.parse(e.starts_at);
            const finish = Date.parse(e.ends_at ?? e.starts_at);
            return s < end && (finish > start || s >= start);
          })
          .map((e) => ({ type: 'event' as const, ...eventRead(e) })),
        ...state.applications
          .filter((a) => a.status === 'wishlist' && inDays(a.deadline_on))
          .map((a) => ({
            type: 'apply_by' as const,
            id: a.id,
            title: `Apply to ${a.company}`,
            date: a.deadline_on ?? '',
            application: { id: a.id, company: a.company, role_title: a.role_title },
          })),
        ...state.reminders
          .filter((r) => params.get('include_done') === 'true' || !r.done_at)
          .filter((r) =>
            r.due_on ? inDays(r.due_on) : Date.parse(r.due_at ?? '') >= start && Date.parse(r.due_at ?? '') < end,
          )
          .map((r) => ({
            type: 'reminder' as const,
            id: r.id,
            title: r.title,
            date: r.due_on,
            starts_at: r.due_at,
            done_at: r.done_at,
            application: ref(r.application_id),
          })),
      ]; // prettier-ignore
      return HttpResponse.json({ items });
    }),
    http.get('/api/v1/calendar-events', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      const applicationId = new URL(request.url).searchParams.get('application_id');
      const listed = state.calendarEvents
        .filter((e) => !applicationId || e.application_id === applicationId)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return HttpResponse.json(listed.map(eventRead));
    }),
    http.post('/api/v1/calendar-events', async ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('POST /calendar-events');
      const input = (await request.json()) as CalendarEventInput;
      if (input.application_id && !find(input.application_id)) return notFound();
      const event = makeEvent({
        kind: input.kind,
        title: input.title,
        starts_at: new Date(input.starts_at).toISOString(),
        ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : null,
        location_or_link: input.location_or_link ?? null,
        application_id: input.application_id ?? null,
      });
      state.calendarEvents.push(event);
      return HttpResponse.json(eventRead(event), { status: 201 });
    }),
    http.patch('/api/v1/calendar-events/:id', async ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('PATCH /calendar-events');
      const event = state.calendarEvents.find((e) => e.id === String(params['id']));
      if (!event) return notFound('Calendar event');
      const patch = (await request.json()) as Partial<CalendarEventInput>;
      if (patch.application_id && !find(patch.application_id)) return notFound();
      const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);
      Object.assign(event, {
        ...patch,
        ...(patch.starts_at !== undefined ? { starts_at: iso(patch.starts_at) } : {}),
        ...(patch.ends_at !== undefined ? { ends_at: iso(patch.ends_at) } : {}),
      });
      return HttpResponse.json(eventRead(event));
    }),
    http.delete('/api/v1/calendar-events/:id', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const id = String(params['id']);
      if (!state.calendarEvents.some((e) => e.id === id)) return notFound('Calendar event');
      state.calls.push('DELETE /calendar-events');
      state.calendarEvents = state.calendarEvents.filter((e) => e.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('/api/v1/resumes', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('GET /resumes');
      // Like the API: the default first, then newest first; archived last.
      const rank = (r: Resume) => (r.archived_at ? 2 : r.is_default ? 0 : 1);
      const sorted = [...state.resumes].sort(
        (a, b) => rank(a) - rank(b) || b.updated_at.localeCompare(a.updated_at),
      );
      return HttpResponse.json(sorted.map(resumeSummary));
    }),
    http.get('/api/v1/resumes/:id', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const resume = state.resumes.find((r) => r.id === String(params['id']));
      return resume ? HttpResponse.json(withUsage(resume)) : notFound('Resume version');
    }),
    http.post('/api/v1/resumes', async ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('POST /resumes');
      const input = (await request.json()) as ResumeInput;
      const resume = makeResume({ label: input.label, content_text: input.content_text });
      if (input.is_default) {
        for (const r of state.resumes) r.is_default = false;
        resume.is_default = true;
      }
      state.resumes.push(resume);
      return HttpResponse.json(withUsage(resume), { status: 201 });
    }),
    http.patch('/api/v1/resumes/:id', async ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('PATCH /resumes');
      const resume = state.resumes.find((r) => r.id === String(params['id']));
      if (!resume) return notFound('Resume version');
      const patch = (await request.json()) as ResumePatch;
      const textChanges =
        patch.content_text !== undefined && patch.content_text !== resume.content_text;
      if (textChanges && inUse(resume)) {
        return error(409, "This version has been used, so its text can't change. Duplicate it instead.");
      } // prettier-ignore
      if (patch.label !== undefined) resume.label = patch.label;
      if (patch.content_text !== undefined) resume.content_text = patch.content_text;
      if (patch.archived === true) {
        resume.archived_at ??= nowIso();
        resume.is_default = false;
      } else if (patch.archived === false) {
        resume.archived_at = null;
      }
      if (patch.is_default === true && !resume.is_default) {
        if (resume.archived_at) return error(409, "An archived resume can't be the default");
        for (const r of state.resumes) r.is_default = false;
        resume.is_default = true;
      } else if (patch.is_default === false) {
        resume.is_default = false;
      }
      resume.updated_at = nowIso();
      return HttpResponse.json(withUsage(resume));
    }),
    http.delete('/api/v1/resumes/:id', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const resume = state.resumes.find((r) => r.id === String(params['id']));
      if (!resume) return notFound('Resume version');
      if (inUse(resume)) {
        return error(409, "This version has been used, so it can't be deleted. Archive it instead.");
      } // prettier-ignore
      state.calls.push('DELETE /resumes');
      state.resumes = state.resumes.filter((r) => r.id !== resume.id);
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('/api/v1/match/config', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      return HttpResponse.json({
        embeddings: state.matchEmbeddings,
        model: state.matchEmbeddings === 'client' ? FAKE_MATCH_MODEL : null,
        max_jd_chars: 20_000,
        max_resume_chunks: 600,
        max_jd_chunks: 300,
      });
    }),
    http.post('/api/v1/match/prepare', async ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('POST /match/prepare');
      const input = (await request.json()) as MatchInput;
      const failure = matchInputError(input);
      if (failure) return failure;
      if (state.matchEmbeddings === 'server') {
        return error(422, 'This server computes the embeddings itself');
      }
      const resume = state.resumes.find((r) => r.id === input.resume_id);
      const jdChunks = lines(input.jd_text);
      const resumeChunks = lines(resume?.content_text ?? '');
      return HttpResponse.json({
        model: FAKE_MATCH_MODEL,
        digest: digest(jdChunks, resumeChunks),
        jd_chunks: jdChunks,
        resume_chunks: resumeChunks,
      });
    }),
    http.post('/api/v1/match', async ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('POST /match');
      const input = (await request.json()) as MatchInput & {
        embeddings?: { digest: string; jd: string; resume: string } | null;
      };
      const failure = matchInputError(input);
      if (failure) return failure;
      const resume = state.resumes.find((r) => r.id === input.resume_id) as Resume;
      const app = input.application_id ? find(input.application_id) : undefined;
      if (input.application_id && !app) return notFound();
      const jdChunks = lines(input.jd_text);
      const resumeChunks = lines(resume.content_text);
      if (state.matchEmbeddings === 'client') {
        if (!input.embeddings) return fieldError('embeddings', 'Field required');
        if (input.embeddings.digest !== digest(jdChunks, resumeChunks)) {
          return error(409, 'The resume or the job description changed since the match was prepared. Try again.');
        } // prettier-ignore
        const dim = FAKE_MATCH_MODEL.dim;
        if (
          decodeVectors(input.embeddings.jd, dim).length !== jdChunks.length ||
          decodeVectors(input.embeddings.resume, dim).length !== resumeChunks.length
        ) {
          return fieldError('embeddings', 'Expected one vector per chunk');
        }
      } else if (input.embeddings) {
        return fieldError('embeddings', 'This server computes the embeddings itself');
      }
      const resumeWords = new Set(words(resume.content_text));
      const jdWords = words(input.jd_text);
      const overlap = jdWords.filter((w) => resumeWords.has(w)).length / (jdWords.length || 1);
      const match = makeMatch({
        score: Math.round(100 * overlap),
        resume_version_id: resume.id,
        resume_label: resume.label,
        application_id: app?.id ?? null,
        company: app?.company ?? null,
        role_title: app?.role_title ?? null,
        jd_text: input.jd_text,
        jd_excerpt: jdChunks[0]?.slice(0, 120) ?? '',
        evidence: [],
      });
      state.matches.unshift(match);
      resume.match_count += 1; // its text is frozen from now on
      return HttpResponse.json(match, { status: 201 });
    }),
    http.get('/api/v1/match', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('GET /match');
      const url = new URL(request.url);
      const applicationId = url.searchParams.get('application_id');
      const page = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('page_size') ?? 20);
      const matching = state.matches
        .filter((m) => !applicationId || m.application_id === applicationId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const items = matching.slice((page - 1) * pageSize, page * pageSize).map(matchSummary);
      return HttpResponse.json({
        items,
        total: matching.length,
        page,
        page_size: pageSize,
        pages: Math.ceil(matching.length / pageSize),
      });
    }),
    http.delete('/api/v1/match', ({ request }) => {
      if (!hasToken(request)) return unauthorized();
      state.calls.push('DELETE /match');
      for (const match of state.matches) {
        const resume = state.resumes.find((r) => r.id === match.resume_version_id);
        if (resume) resume.match_count -= 1; // frozen now only if an application links it
      }
      state.matches = [];
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/v1/match/:id', ({ request, params }) => {
      if (!hasToken(request)) return unauthorized();
      const match = state.matches.find((m) => m.id === String(params['id']));
      return match ? HttpResponse.json(match) : notFound('Match');
    }),
  );

  /** The mode, the JD and the resume, checked like the API (in this order). */
  function matchInputError(input: MatchInput) {
    if (state.matchEmbeddings === 'off') return error(503, 'Matching is switched off on this server');
    if (!input.jd_text?.trim()) return fieldError('jd_text', 'Paste the job description');
    const resume = state.resumes.find((r) => r.id === input.resume_id);
    if (!resume) return notFound('Resume version');
    if (resume.archived_at) {
      return error(422, 'This resume version is archived. Unarchive it to match against it.');
    }
    return null;
  } // prettier-ignore

  return state;
}

const fieldError = (field: string, msg: string) =>
  HttpResponse.json(
    { detail: [{ type: 'value_error', loc: ['body', field], msg }] },
    { status: 422 },
  );
const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^[\s\-•*]+/, '').trim())
    .filter(Boolean);
const digest = (jd: string[], resume: string[]) => JSON.stringify([jd, resume]);
const words = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];

/** The list leaves out the text and the details, like the API. */
function matchSummary(match: Match) {
  const { id, score, resume_version_id, resume_label, application_id, company, role_title, jd_excerpt, is_current, created_at } = match;
  return { id, score, resume_version_id, resume_label, application_id, company, role_title, jd_excerpt, is_current, created_at };
} // prettier-ignore

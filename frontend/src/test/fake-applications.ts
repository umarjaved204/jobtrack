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
 *   (422), and usage counts come from the applications here.
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

type State = {
  applications: Application[];
  events: Map<string, ApplicationEvent[]>;
  contacts: Contact[];
  tags: Tag[];
  resumes: Resume[];
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
  moveLatencyMs = 0,
  failMovesFor = [],
  boardLatencyMs = 0,
}: {
  applications?: Application[];
  tags?: Tag[];
  contacts?: Contact[];
  resumes?: Resume[];
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
  );

  return state;
}

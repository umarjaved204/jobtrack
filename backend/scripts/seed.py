"""Development seed: one demo user with ~3 months of realistic job-hunt history.

    cd backend && uv run python -m scripts.seed

Everything is created through the real service functions (password hashing, initial
status events, kanban positions, applied_on auto-fill, contacts, notes, resume versions,
reminders, calendar events), so the data follows the same rules as the app. Two things
are bent, on purpose:

* **Time.** The services read the clock through `app.services.applications._now`; the
  seed swaps in a controlled clock so events, applied_on and notes are backdated over
  ~90 days. `created_at`/`updated_at` (and a resume's `archived_at`) come from the
  database or real clock, so they are set to match afterwards. (Phase 7's charts and
  funnel read this history.) Reminders and calendar events sit around today, so every
  state the UI has is visible: overdue, due today, upcoming, done, overnight, multi-day.
* **The sign-up email check** (DNS) is skipped for the demo account.

Deterministic (fixed random seed): every run deletes the demo user (cascading all of its
data) and recreates the same history relative to today. Refuses to run in production.
"""

import random
import sys
import uuid
from collections import Counter
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal  # creates the engine only; connects on first use
from app.models import Application, ResumeVersion, User
from app.models.enums import ApplicationStatus, CalendarEventKind, WorkMode
from app.schemas.application import ApplicationCreate, ApplicationUpdate
from app.schemas.auth import RegisterRequest
from app.schemas.calendar import CalendarEventCreate
from app.schemas.contact import ContactCreate
from app.schemas.reminder import ReminderCreate, ReminderUpdate
from app.schemas.resume import ResumeCreate, ResumeUpdate
from app.schemas.tag import TagCreate
from app.services import applications as applications_service
from app.services import auth as auth_service
from app.services import calendar as calendar_service
from app.services import contacts as contacts_service
from app.services import reminders as reminders_service
from app.services import resumes as resumes_service
from app.services import tags as tags_service
from app.services import users as users_service

DEMO_EMAIL = "sam.okafor@jobtrack-demo.com"
DEMO_PASSWORD = "demo-password-2026"  # noqa: S105  (local demo account, printed on purpose)
DEMO_NAME = "Sam Okafor"
RANDOM_SEED = 20261117
HISTORY_DAYS = 90

S = ApplicationStatus

TAGS = [
    ("Remote", "cobalt"),
    ("Referral", "forest"),
    ("Dream job", "vermilion"),
    ("Fintech", "plum"),
    ("Visa sponsorship", "ochre"),
    ("Startup", "teal"),
]

COMPANIES = [
    "Monzo", "Wise", "Octopus Energy", "Deliveroo", "Revolut", "Starling Bank", "Skyscanner",
    "Ocado Technology", "Trainline", "Citymapper", "Depop", "ASOS", "Farfetch", "Zopa", "Cleo",
    "Thought Machine", "Snyk", "Darktrace", "Spotify", "Figma", "Canva", "Atlassian", "Shopify",
    "GitLab", "Elastic", "Intercom", "Duolingo", "Linear", "Vercel", "Supabase", "PostHog",
    "Algolia", "Contentful", "Miro", "Personio", "GOV.UK", "BBC", "Arm", "Bumble", "Moonpig",
]  # fmt: skip
ROLES = [
    "Frontend Engineer",
    "Senior Frontend Engineer",
    "Full-stack Engineer",
    "Product Engineer",
    "Software Engineer, Payments",
    "Design Systems Engineer",
    "Senior Software Engineer (TypeScript)",
    "React Developer",
]
LOCATIONS = [
    ("London", WorkMode.HYBRID),
    ("London", WorkMode.ONSITE),
    ("Manchester", WorkMode.HYBRID),
    ("Edinburgh", WorkMode.HYBRID),
    ("Bristol", WorkMode.HYBRID),
    ("Cambridge", WorkMode.ONSITE),
    ("Remote (UK)", WorkMode.REMOTE),
    ("Remote (Europe)", WorkMode.REMOTE),
]
SOURCES = ["LinkedIn", "Company website", "Referral", "Otta", "Indeed", "Recruiter", "Hacker News"]

# Believable paths through the pipeline, with weights. Each step happens 2-12 days after
# the previous one; a step that would land in the future isn't taken yet (so recent
# applications are naturally earlier in their path).
PATHS: list[tuple[list[ApplicationStatus], int]] = [
    ([S.WISHLIST], 5),
    ([S.WISHLIST, S.APPLIED], 3),
    ([S.APPLIED], 9),
    ([S.APPLIED, S.REJECTED], 8),
    ([S.APPLIED, S.SCREENING, S.REJECTED], 4),
    ([S.APPLIED, S.SCREENING, S.INTERVIEW], 4),
    ([S.APPLIED, S.SCREENING, S.INTERVIEW, S.REJECTED], 3),
    ([S.WISHLIST, S.APPLIED, S.SCREENING, S.INTERVIEW, S.OFFER], 1),
    ([S.APPLIED, S.SCREENING, S.INTERVIEW, S.OFFER], 1),
    ([S.APPLIED, S.WITHDRAWN], 1),
    ([S.APPLIED, S.SCREENING, S.WITHDRAWN], 1),
]

NOTES: dict[ApplicationStatus, list[str]] = {
    S.APPLIED: [
        "Tailored the resume around design systems work.",
        "Applied with a short cover note about the payments migration project.",
    ],
    S.SCREENING: [
        "Recruiter call went well. Asked about hybrid days and the on-call rota.",
        "30-minute intro call booked. Prepare the 'why this company' answer.",
    ],
    S.INTERVIEW: [
        "Take-home: build a small accessible data table. Due in five days.",
        "Pairing interview with two engineers. Felt good about the testing discussion.",
        "System design round next: read up on offline-first sync.",
    ],
    S.OFFER: ["Offer received. Asked for the full benefits pack before negotiating."],
    S.REJECTED: [
        "Rejected after the final round. Feedback: wanted more backend depth.",
        "Automated rejection, no feedback.",
    ],
    S.WITHDRAWN: ["Withdrew: the role turned out to be mostly backend."],
}

# Three versions sent over the search (v1 archived once v2 replaced it) and an unused draft.
_CONTACT = "London | sam.okafor@jobtrack-demo.com | github.com/sam-okafor-demo"
RESUMES: list[tuple[str, str]] = [
    (
        "Frontend v1 (general)",
        f"""Sam Okafor
{_CONTACT}

Frontend engineer with five years of experience building web apps in React and TypeScript.

Experience
Frontend Engineer, Halden Insurance (2022 to now)
- Rebuilt the quote journey in React and TypeScript; conversion up 12%.
- Introduced Jest and React Testing Library; coverage from 20% to 75%.
- Worked with designers on a shared component library.

Junior Developer, Northgate Digital (2020 to 2022)
- Built marketing sites and dashboards with React, Sass and REST APIs.

Skills
React, TypeScript, JavaScript, HTML, CSS, Sass, Jest, React Testing Library, Git, REST""",
    ),
    (
        "Frontend v2 (design systems)",
        f"""Sam Okafor
{_CONTACT}

Frontend engineer focused on design systems and accessibility. Five years of React and
TypeScript, most recently leading a component library used by six product teams.

Experience
Frontend Engineer, Halden Insurance (2022 to now)
- Led the design system: 60 accessible components, Storybook docs, visual regression tests.
- Audited the quote journey against WCAG 2.2 AA and fixed 40+ issues with the team.
- Rebuilt the quote journey in React and TypeScript; conversion up 12%.

Junior Developer, Northgate Digital (2020 to 2022)
- Built marketing sites and dashboards with React, Sass and REST APIs.

Skills
React, TypeScript, design systems, Storybook, accessibility (WCAG, ARIA), CSS architecture,
Tailwind CSS, Jest, React Testing Library, Playwright, Figma""",
    ),
    (
        "Frontend v3 (product)",
        f"""Sam Okafor
{_CONTACT}

Product-minded frontend engineer. I ship measurable improvements to customer journeys,
from research to release, with strong foundations in accessibility and testing.

Experience
Frontend Engineer, Halden Insurance (2022 to now)
- Owned the quote journey end to end: A/B tests, analytics, React and TypeScript rebuild;
  conversion up 12% and support tickets down 18%.
- Led the design system (60 accessible components, Storybook, visual regression tests).
- Mentored two junior engineers; ran the frontend guild's monthly sessions.

Junior Developer, Northgate Digital (2020 to 2022)
- Built dashboards with React, D3 and REST APIs for logistics clients.

Skills
React, TypeScript, Next.js, Node.js, GraphQL, PostgreSQL basics, experimentation,
product analytics, accessibility, Playwright, CI/CD""",
    ),
    (
        "Full-stack draft",
        f"""Sam Okafor
{_CONTACT}

Draft: frontend engineer moving towards full-stack work with Node.js, PostgreSQL and React.""",
    ),
]
DEFAULT_RESUME = "Frontend v3 (product)"

RECRUITERS = ["Daniel Okoro", "Hannah Price", "Ravi Menon", "Chloe Martin", "Tom Fletcher"]
MANAGERS = ["Priya Shah", "Marcus Lee", "Elena Rossi", "Kwame Mensah", "Sofia Novak"]


@dataclass
class SeedSummary:
    user_id: str
    applications: int
    by_status: Counter[ApplicationStatus] = field(default_factory=Counter)
    notes: int = 0
    contacts: int = 0
    resumes: int = 0
    reminders: int = 0
    events: int = 0


class _Clock:
    """Stands in for `applications._now` while seeding."""

    def __init__(self, at: datetime) -> None:
        self.at = at

    def __call__(self) -> datetime:
        return self.at


@contextmanager
def _seeding_mode(clock: _Clock) -> Iterator[None]:
    """Backdate through the services' clock and skip the sign-up DNS check."""
    settings = get_settings()
    original_now = applications_service._now
    original_check = settings.email_domain_check_enabled
    applications_service._now = clock
    settings.email_domain_check_enabled = False
    try:
        yield
    finally:
        applications_service._now = original_now
        settings.email_domain_check_enabled = original_check


def _working_hours(day: date, rng: random.Random) -> datetime:
    return datetime.combine(day, time(rng.randint(8, 18), rng.randint(0, 59)), tzinfo=UTC)


def _delete_demo_user(db: Session) -> None:
    existing = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if existing is not None:
        users_service.delete_user(db, existing)  # ON DELETE CASCADE removes all its data


def seed_demo_data(db: Session, *, now: datetime | None = None) -> SeedSummary:
    """Recreate the demo user and its history, ending at `now` (default: the real now)."""
    now = now or datetime.now(UTC)
    rng = random.Random(RANDOM_SEED)  # noqa: S311  (reproducible fake data, not security)
    start = now - timedelta(days=HISTORY_DAYS)
    clock = _Clock(start - timedelta(days=1))

    with _seeding_mode(clock):
        _delete_demo_user(db)
        user = auth_service.register_user(
            db, RegisterRequest(email=DEMO_EMAIL, password=DEMO_PASSWORD, full_name=DEMO_NAME)
        )
        user.created_at = clock.at
        tags = [
            tags_service.create_tag(db, user, TagCreate(name=name, color=color))
            for name, color in TAGS
        ]
        summary = SeedSummary(user_id=str(user.id), applications=0)
        resumes = _create_resumes(db, user, start, now)
        summary.resumes = len(resumes)

        companies = rng.sample(COMPANIES, k=len(COMPANIES))
        paths, weights = zip(*PATHS, strict=True)
        for company in companies:
            path = rng.choices(paths, weights=weights)[0]
            first_day = (start + timedelta(days=rng.randint(0, HISTORY_DAYS - 1))).date()
            location, work_mode = rng.choice(LOCATIONS)
            salary_min = rng.randrange(45_000, 90_000, 5_000)
            clock.at = _working_hours(first_day, rng)
            created_at = clock.at

            application = applications_service.create_application(
                db,
                user,
                ApplicationCreate(
                    company=company,
                    role_title=rng.choice(ROLES),
                    location=location,
                    work_mode=work_mode,
                    job_url=f"https://jobs.example.org/{company.lower().replace(' ', '-')}/"
                    f"{rng.randint(1000, 9999)}",
                    salary_min=salary_min,
                    salary_max=salary_min + rng.randrange(10_000, 25_000, 5_000),
                    salary_currency="GBP",
                    source=rng.choice(SOURCES),
                    status=path[0],
                    deadline_on=(first_day + timedelta(days=rng.randint(7, 21)))
                    if path[0] == S.WISHLIST
                    else None,
                    tag_ids=[t.id for t in rng.sample(tags, k=rng.randint(0, 2))],
                    # The version that was current then (none for a wishlist-only idea).
                    resume_version_id=None
                    if path == [S.WISHLIST]
                    else resumes[min((first_day - start.date()).days // 30, 2)].id,
                ),
            )

            # Walk the rest of the path while it stays in the past.
            for status in path[1:]:
                next_at = clock.at + timedelta(days=rng.randint(2, 12), hours=rng.randint(1, 6))
                if next_at >= now:
                    break
                clock.at = next_at
                applications_service.update_application(
                    db, user, application.id, ApplicationUpdate(status=status)
                )
                summary.contacts += _add_contacts(db, user, application, status, rng)
                if rng.random() < 0.6 and NOTES.get(status):
                    clock.at += timedelta(minutes=rng.randint(10, 240))
                    applications_service.add_note(
                        db, user, application.id, rng.choice(NOTES[status])
                    )
                    summary.notes += 1

            # Database-clock columns: align them with the backdated history.
            application.created_at = created_at
            application.updated_at = clock.at
            db.commit()
            summary.applications += 1
            summary.by_status[application.status] += 1

        # v1 was replaced by v2 a month in: archive it now that its applications exist.
        resumes_service.update_resume(db, user, resumes[0].id, ResumeUpdate(archived=True))
        resumes[0].archived_at = resumes[0].updated_at = start + timedelta(days=31)
        db.commit()

        summary.reminders = _create_reminders(db, user, now)
        summary.events = _create_events(db, user, now)

    return summary


def _create_resumes(db: Session, user: User, start: datetime, now: datetime) -> list[ResumeVersion]:
    """v1 just before the search, v2 a month in, v3 (the default) two months in, and a
    draft this week."""
    written = [
        start - timedelta(days=2),
        start + timedelta(days=29),
        start + timedelta(days=59),
        now - timedelta(days=3),
    ]
    resumes = []
    for (label, text), at in zip(RESUMES, written, strict=True):
        created = resumes_service.create_resume(
            db,
            user,
            ResumeCreate(label=label, content_text=text, is_default=label == DEFAULT_RESUME),
        )
        resume = db.get_one(ResumeVersion, created.id)
        resume.created_at = resume.updated_at = at
        resumes.append(resume)
    db.commit()
    return resumes


def _pick(db: Session, user: User, status: ApplicationStatus, skip: int = 0) -> Application | None:
    """A demo application in `status`, alphabetically (so the pick is stable)."""
    return db.scalars(
        select(Application)
        .where(Application.user_id == user.id, Application.status == status)
        .order_by(Application.company)
        .offset(skip)
        .limit(1)
    ).first()


def _id(application: Application | None) -> uuid.UUID | None:
    return application.id if application is not None else None


def _company(application: Application | None, fallback: str) -> str:
    return application.company if application is not None else fallback


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=UTC)


def _create_reminders(db: Session, user: User, now: datetime) -> int:
    """Open ones overdue (one beyond the 30-day cap), due today and upcoming; all-day and
    timed; linked and not. Plus one done."""
    today = now.date()
    interview = _pick(db, user, S.INTERVIEW)
    screening = _pick(db, user, S.SCREENING)
    applied = _pick(db, user, S.APPLIED)
    applied_2 = _pick(db, user, S.APPLIED, skip=1)
    offer = _pick(db, user, S.OFFER)

    def day(offset: int) -> date:
        return today + timedelta(days=offset)

    reminders = [
        ReminderCreate(
            title=f"Chase {_company(interview, 'the hiring team')} for take-home feedback",
            application_id=_id(interview),
            due_on=day(-3),
        ),
        ReminderCreate(title="Ask an old teammate for a referral", due_on=day(-41)),
        ReminderCreate(
            title=f"Follow up on the {_company(applied, 'latest')} application",
            application_id=_id(applied),
            due_at=_at(day(-1), 10),
        ),
        ReminderCreate(
            title=f"Send a thank-you note to {_company(screening, 'the recruiter')}",
            application_id=_id(screening),
            due_on=today,
        ),
        ReminderCreate(
            title=f"Call the {_company(offer, 'hiring')} recruiter about the offer",
            application_id=_id(offer),
            due_at=_at(day(1), 14),
        ),
        ReminderCreate(
            title=f"Check in with {_company(applied_2, 'the company')} if no reply",
            application_id=_id(applied_2),
            due_on=day(6),
        ),
        ReminderCreate(title="Refresh portfolio screenshots", due_at=_at(day(9), 18)),
    ]
    for data in reminders:
        reminders_service.create_reminder(db, user, data)

    done = reminders_service.create_reminder(
        db,
        user,
        ReminderCreate(title="Update the quote journey case study", due_on=day(-6)),
    )
    reminders_service.update_reminder(db, user, done.id, ReminderUpdate(done=True))
    return len(reminders) + 1


def _create_events(db: Session, user: User, now: datetime) -> int:
    """A past screen, a multi-day take-home, upcoming interviews (one crosses midnight
    UTC), an offer deadline, and one with a plain-text location."""
    today = now.date()
    interview = _pick(db, user, S.INTERVIEW)
    interview_2 = _pick(db, user, S.INTERVIEW, skip=1)
    screening = _pick(db, user, S.SCREENING)
    offer = _pick(db, user, S.OFFER)

    def day(offset: int) -> date:
        return today + timedelta(days=offset)

    events = [
        CalendarEventCreate(
            kind=CalendarEventKind.INTERVIEW,
            title="Recruiter screen",
            starts_at=_at(day(-5), 11),
            ends_at=_at(day(-5), 11, 30),
            location_or_link="Phone call",
            application_id=_id(screening),
        ),
        CalendarEventCreate(
            kind=CalendarEventKind.ASSESSMENT,
            title="Take-home: accessible data table",
            starts_at=_at(day(-1), 9),
            ends_at=_at(day(4), 17),
            application_id=_id(interview),
        ),
        CalendarEventCreate(
            kind=CalendarEventKind.INTERVIEW,
            title="Technical interview (pairing)",
            starts_at=_at(day(2), 14),
            ends_at=_at(day(2), 15, 30),
            location_or_link="https://meet.example.org/sam-okafor-pairing",
            application_id=_id(interview),
        ),
        CalendarEventCreate(
            kind=CalendarEventKind.INTERVIEW,
            title="Hiring manager call (Sydney team)",
            starts_at=_at(day(3), 23),
            ends_at=_at(day(4), 0, 30),  # crosses midnight UTC
            location_or_link="https://meet.example.org/sam-okafor-sydney",
            application_id=_id(interview_2),
        ),
        CalendarEventCreate(
            kind=CalendarEventKind.DEADLINE,
            title="Reply to the offer",
            starts_at=_at(day(5), 17),
            application_id=_id(offer),
        ),
        CalendarEventCreate(
            kind=CalendarEventKind.OTHER,
            title="Coffee with a former colleague",
            starts_at=_at(day(8), 8, 30),
            ends_at=_at(day(8), 9, 15),
            location_or_link="Old Street, London",
        ),
    ]
    for data in events:
        calendar_service.create_event(db, user, data)
    return len(events)


def _add_contacts(
    db: Session,
    user: User,
    application: Application,
    status: ApplicationStatus,
    rng: random.Random,
) -> int:
    slug = application.company.lower().replace(" ", "").replace(".", "")
    people: list[tuple[str, str]] = []
    if status == S.SCREENING:
        people.append((rng.choice(RECRUITERS), "Recruiter"))
    elif status == S.INTERVIEW:
        people.append((rng.choice(MANAGERS), "Engineering Manager"))
    for name, role in people:
        first = name.split()[0].lower()
        contacts_service.create_contact(
            db,
            user,
            application.id,
            # Fictional mailbox under the demo domain (example.com is a reserved name that
            # email validation rejects, and real company domains could look genuine).
            ContactCreate(name=name, role=role, email=f"{first}@{slug}.jobtrack-demo.com"),
        )
    return len(people)


def main() -> int:
    settings = get_settings()
    if settings.environment == "production":
        print("Refusing to seed: ENVIRONMENT is production.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        summary = seed_demo_data(db)

    statuses = ", ".join(  # pipeline order: wishlist, applied, ... withdrawn
        f"{s.value} {summary.by_status[s]}" for s in ApplicationStatus if summary.by_status[s]
    )
    print(f"Seeded {summary.applications} applications ({statuses}),")
    print(f"{summary.notes} notes and {summary.contacts} contacts over {HISTORY_DAYS} days;")
    print(
        f"{summary.resumes} resume versions, {summary.reminders} reminders "
        f"and {summary.events} calendar events around today."
    )
    print(f"Sign in as {DEMO_EMAIL} / {DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

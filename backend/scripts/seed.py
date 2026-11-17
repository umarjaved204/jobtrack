"""Development seed: one demo user with ~3 months of realistic job-hunt history.

    cd backend && uv run python -m scripts.seed

Everything is created through the real service functions (password hashing, initial
status events, kanban positions, applied_on auto-fill, contacts, notes), so the data
follows the same rules as the app. Two things are bent, on purpose:

* **Time.** The services read the clock through `app.services.applications._now`; the
  seed swaps in a controlled clock so events, applied_on and notes are backdated over
  ~90 days. `created_at`/`updated_at` come from the database clock, so they are set to
  match afterwards. (Phase 7's charts and funnel read this history.)
* **The sign-up email check** (DNS) is skipped for the demo account.

Deterministic (fixed random seed): every run deletes the demo user (cascading all of its
data) and recreates the same history relative to today. Refuses to run in production.
"""

import random
import sys
from collections import Counter
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal  # creates the engine only; connects on first use
from app.models import Application, User
from app.models.enums import ApplicationStatus, WorkMode
from app.schemas.application import ApplicationCreate, ApplicationUpdate
from app.schemas.auth import RegisterRequest
from app.schemas.contact import ContactCreate
from app.schemas.tag import TagCreate
from app.services import applications as applications_service
from app.services import auth as auth_service
from app.services import contacts as contacts_service
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

RECRUITERS = ["Daniel Okoro", "Hannah Price", "Ravi Menon", "Chloe Martin", "Tom Fletcher"]
MANAGERS = ["Priya Shah", "Marcus Lee", "Elena Rossi", "Kwame Mensah", "Sofia Novak"]


@dataclass
class SeedSummary:
    user_id: str
    applications: int
    by_status: Counter[ApplicationStatus] = field(default_factory=Counter)
    notes: int = 0
    contacts: int = 0


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

    return summary


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
    print(f"{summary.notes} notes and {summary.contacts} contacts over {HISTORY_DAYS} days.")
    print(f"Sign in as {DEMO_EMAIL} / {DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

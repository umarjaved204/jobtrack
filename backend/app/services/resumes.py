"""Resume versions.

Rules (the point of *versions* is a faithful record of what was sent):
- A version that's in use (sent with an application, or used by a match result) has
  frozen text: its label can change, its text can't. Duplicate it to make changes.
- An in-use version can't be deleted, only archived. Archived versions are hidden from
  pickers, can't be the default, and can be unarchived.
- At most one default per user. Changing it locks the user's row first, so concurrent
  requests queue instead of colliding on the unique index.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import ScalarSelect, Select, func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import Application, MatchResult, ResumeVersion, User
from app.schemas.resume import ResumeCreate, ResumeRead, ResumeSummary, ResumeUpdate

NOT_FOUND = "Resume version not found"
TEXT_FROZEN = "This version has been used, so its text can't change. Duplicate it instead."
IN_USE = "This version has been used, so it can't be deleted. Archive it instead."
ARCHIVED_DEFAULT = "An archived resume can't be the default"


def _application_count() -> ScalarSelect[int]:
    return (
        select(func.count())
        .where(Application.resume_version_id == ResumeVersion.id)
        .correlate(ResumeVersion)
        .scalar_subquery()
    )


def _match_count() -> ScalarSelect[int]:
    return (
        select(func.count())
        .where(MatchResult.resume_version_id == ResumeVersion.id)
        .correlate(ResumeVersion)
        .scalar_subquery()
    )


def _with_usage(user: User) -> Select[ResumeVersion, int, int, int]:
    return select(
        ResumeVersion,
        func.char_length(ResumeVersion.content_text),
        _application_count(),
        _match_count(),
    ).where(ResumeVersion.user_id == user.id)


def _summary(row: Any) -> ResumeSummary:
    resume, char_count, application_count, match_count = row
    return ResumeSummary(
        id=resume.id,
        label=resume.label,
        is_default=resume.is_default,
        archived_at=resume.archived_at,
        char_count=char_count,
        application_count=application_count,
        match_count=match_count,
        created_at=resume.created_at,
        updated_at=resume.updated_at,
    )


def list_resumes(db: Session, user: User) -> list[ResumeSummary]:
    """The default first, then the rest newest first; archived versions last."""
    stmt = _with_usage(user).order_by(
        ResumeVersion.archived_at.is_not(None),
        ResumeVersion.is_default.desc(),
        ResumeVersion.updated_at.desc(),
        ResumeVersion.id,
    )
    return [_summary(row) for row in db.execute(stmt)]


def get_resume(db: Session, user: User, resume_id: uuid.UUID) -> ResumeRead:
    row = db.execute(_with_usage(user).where(ResumeVersion.id == resume_id)).one_or_none()
    if row is None:
        raise NotFoundError(NOT_FOUND)
    return ResumeRead(**_summary(row).model_dump(), content_text=row[0].content_text)


def _lock_user(db: Session, user: User) -> None:
    """Serialise default changes per user: a second request waits here until the first
    commits, and its next statements (READ COMMITTED) then see the new default."""
    db.execute(select(User.id).where(User.id == user.id).with_for_update())


def _owned(db: Session, user: User, resume_id: uuid.UUID, *, lock: bool = False) -> ResumeVersion:
    stmt = select(ResumeVersion).where(
        ResumeVersion.id == resume_id, ResumeVersion.user_id == user.id
    )
    resume = db.scalar(stmt.with_for_update() if lock else stmt)
    if resume is None:
        raise NotFoundError(NOT_FOUND)
    return resume


def _uses(db: Session, resume: ResumeVersion) -> int:
    """Applications plus match results that reference this version."""
    row = db.execute(
        select(_application_count(), _match_count()).where(ResumeVersion.id == resume.id)
    ).one()
    return int(row[0]) + int(row[1])


def _make_default(db: Session, user: User, resume: ResumeVersion) -> None:
    """The caller holds the user lock. The old default is unset and flushed before the new
    one is set, because the unique index is checked per statement."""
    for other in db.scalars(
        select(ResumeVersion).where(
            ResumeVersion.user_id == user.id,
            ResumeVersion.is_default,
            ResumeVersion.id != resume.id,
        )
    ):
        other.is_default = False
    db.flush()
    resume.is_default = True


def create_resume(db: Session, user: User, data: ResumeCreate) -> ResumeRead:
    resume = ResumeVersion(
        id=uuid.uuid4(), user_id=user.id, label=data.label, content_text=data.content_text
    )
    if data.is_default:
        _lock_user(db, user)
        _make_default(db, user, resume)
    db.add(resume)
    db.commit()
    return get_resume(db, user, resume.id)


def update_resume(db: Session, user: User, resume_id: uuid.UUID, data: ResumeUpdate) -> ResumeRead:
    if data.is_default is not None or data.archived is not None:
        _lock_user(db, user)
    resume = _owned(db, user, resume_id)

    if data.label is not None:
        resume.label = data.label
    if data.content_text is not None and data.content_text != resume.content_text:
        if _uses(db, resume):
            raise ConflictError(TEXT_FROZEN)
        resume.content_text = data.content_text

    if data.archived is True:
        resume.archived_at = resume.archived_at or datetime.now(UTC)
        resume.is_default = False
    elif data.archived is False:
        resume.archived_at = None

    if data.is_default is True and not resume.is_default:
        if resume.archived_at is not None:
            raise ConflictError(ARCHIVED_DEFAULT)
        _make_default(db, user, resume)
    elif data.is_default is False:
        resume.is_default = False

    db.commit()
    return get_resume(db, user, resume.id)


def delete_resume(db: Session, user: User, resume_id: uuid.UUID) -> None:
    # FOR UPDATE conflicts with the KEY SHARE lock that linking an application (or saving
    # a match) takes on this row, so a link in flight commits first and is counted below,
    # instead of being silently undone by ON DELETE SET NULL.
    resume = _owned(db, user, resume_id, lock=True)
    if _uses(db, resume):
        raise ConflictError(IN_USE)
    db.delete(resume)
    db.commit()

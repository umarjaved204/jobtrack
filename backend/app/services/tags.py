import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import Tag, User
from app.schemas.tag import TagCreate, TagUpdate

DUPLICATE = "A tag with this name already exists"


def list_tags(db: Session, user: User) -> list[Tag]:
    return list(db.scalars(select(Tag).where(Tag.user_id == user.id).order_by(Tag.name)))


def _get_tag(db: Session, user: User, tag_id: uuid.UUID) -> Tag:
    tag = db.scalar(select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id))
    if tag is None:
        raise NotFoundError("Tag not found")
    return tag


def _ensure_unique(db: Session, user: User, name: str, exclude_id: uuid.UUID | None = None) -> None:
    """Names are unique per user, case-insensitively ("Remote" == "remote")."""
    stmt = select(Tag.id).where(Tag.user_id == user.id, func.lower(Tag.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(Tag.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise ConflictError(DUPLICATE)


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:  # concurrent create with the same exact name
        db.rollback()
        raise ConflictError(DUPLICATE) from exc


def create_tag(db: Session, user: User, data: TagCreate) -> Tag:
    _ensure_unique(db, user, data.name)
    tag = Tag(user_id=user.id, name=data.name, color=data.color)
    db.add(tag)
    _commit(db)
    return tag


def update_tag(db: Session, user: User, tag_id: uuid.UUID, data: TagUpdate) -> Tag:
    tag = _get_tag(db, user, tag_id)
    if data.name is not None:
        _ensure_unique(db, user, data.name, exclude_id=tag.id)
        tag.name = data.name
    if data.color is not None:
        tag.color = data.color
    _commit(db)
    return tag


def delete_tag(db: Session, user: User, tag_id: uuid.UUID) -> None:
    db.delete(_get_tag(db, user, tag_id))  # removed from applications via ON DELETE CASCADE
    db.commit()

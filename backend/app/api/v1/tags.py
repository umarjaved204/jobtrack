import uuid

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.models import Tag
from app.schemas.tag import TagCreate, TagRead, TagUpdate
from app.services import tags as service

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagRead])
def list_tags(user: CurrentUser, db: DbSession) -> list[Tag]:
    return service.list_tags(db, user)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TagRead)
def create_tag(data: TagCreate, user: CurrentUser, db: DbSession) -> Tag:
    return service.create_tag(db, user, data)


@router.patch("/{tag_id}", response_model=TagRead)
def update_tag(tag_id: uuid.UUID, data: TagUpdate, user: CurrentUser, db: DbSession) -> Tag:
    return service.update_tag(db, user, tag_id, data)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_tag(db, user, tag_id)

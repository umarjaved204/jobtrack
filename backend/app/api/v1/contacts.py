import uuid
from typing import Any

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.models import Contact
from app.schemas.contact import ContactCreate, ContactRead, ContactUpdate
from app.services import contacts as service

router = APIRouter(tags=["contacts"])

_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "Application or contact not found (or not yours)"}
}


@router.get(
    "/applications/{application_id}/contacts",
    response_model=list[ContactRead],
    responses=_NOT_FOUND,
)
def list_contacts(application_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[Contact]:
    return service.list_contacts(db, user, application_id)


@router.post(
    "/applications/{application_id}/contacts",
    status_code=status.HTTP_201_CREATED,
    response_model=ContactRead,
    responses=_NOT_FOUND,
)
def create_contact(
    application_id: uuid.UUID, data: ContactCreate, user: CurrentUser, db: DbSession
) -> Contact:
    return service.create_contact(db, user, application_id, data)


@router.patch("/contacts/{contact_id}", response_model=ContactRead, responses=_NOT_FOUND)
def update_contact(
    contact_id: uuid.UUID, data: ContactUpdate, user: CurrentUser, db: DbSession
) -> Contact:
    return service.update_contact(db, user, contact_id, data)


@router.delete(
    "/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_NOT_FOUND
)
def delete_contact(contact_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_contact(db, user, contact_id)

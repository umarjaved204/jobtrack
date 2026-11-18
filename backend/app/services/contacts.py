"""Contacts (recruiters, interviewers) attached to an application.

Ownership goes through the parent application: a contact is visible only if its application
belongs to the user. Anything else is a 404 (never 403), like every other resource.
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import Application, Contact, User
from app.schemas.contact import ContactCreate, ContactUpdate
from app.services.applications import get_application

NOT_FOUND = "Contact not found"


def list_contacts(db: Session, user: User, application_id: uuid.UUID) -> list[Contact]:
    application = get_application(db, user, application_id)  # 404 if not the user's
    return list(
        db.scalars(
            select(Contact)
            .where(Contact.application_id == application.id)
            .order_by(Contact.name, Contact.id)
        )
    )


def create_contact(
    db: Session, user: User, application_id: uuid.UUID, data: ContactCreate
) -> Contact:
    application = get_application(db, user, application_id)
    contact = Contact(application_id=application.id, **data.model_dump())
    db.add(contact)
    db.commit()
    return contact


def _get_contact(db: Session, user: User, contact_id: uuid.UUID) -> Contact:
    contact = db.scalar(
        select(Contact)
        .join(Application, Application.id == Contact.application_id)
        .where(Contact.id == contact_id, Application.user_id == user.id)
    )
    if contact is None:
        raise NotFoundError(NOT_FOUND)
    return contact


def update_contact(db: Session, user: User, contact_id: uuid.UUID, data: ContactUpdate) -> Contact:
    contact = _get_contact(db, user, contact_id)
    changes: dict[str, Any] = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(contact, field, value)
    db.commit()
    return contact


def delete_contact(db: Session, user: User, contact_id: uuid.UUID) -> None:
    db.delete(_get_contact(db, user, contact_id))
    db.commit()

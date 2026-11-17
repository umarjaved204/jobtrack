import uuid
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

from app.schemas.application import JobUrl

# Lengths match the `contacts` columns (app/models/application.py).
ContactName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
ContactRole = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
ContactNotes = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
# Format check only (no DNS lookup: that is for account sign-up). Column holds 320.
ContactEmail = Annotated[EmailStr, Field(max_length=320)]
# Any http(s) URL up to 2048 chars, same validator as job URLs. Not restricted to
# linkedin.com: regional subdomains and short links (lnkd.in) are common.
ProfileUrl = JobUrl


class ContactCreate(BaseModel):
    name: ContactName
    role: ContactRole | None = None
    email: ContactEmail | None = None
    phone: Phone | None = None
    linkedin_url: ProfileUrl | None = None
    notes: ContactNotes | None = None


class ContactUpdate(BaseModel):
    """PATCH: only sent fields change. Send null to clear an optional field."""

    model_config = ConfigDict(extra="forbid")

    name: ContactName | None = None
    role: ContactRole | None = None
    email: ContactEmail | None = None
    phone: Phone | None = None
    linkedin_url: ProfileUrl | None = None
    notes: ContactNotes | None = None

    @model_validator(mode="after")
    def _name_not_cleared(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class ContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    name: str
    role: str | None
    email: str | None
    phone: str | None
    linkedin_url: str | None
    notes: str | None

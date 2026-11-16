import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.enums import ThemePreference

FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# Accent palette names are finalised with the design tokens in Phase 4.
Accent = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z-]{0,19}$")]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    theme: ThemePreference
    accent: str
    created_at: datetime


class UserUpdate(BaseModel):
    """PATCH semantics: only fields that are sent get updated."""

    model_config = ConfigDict(extra="forbid")

    full_name: FullName | None = None
    theme: ThemePreference | None = None
    accent: Accent | None = None

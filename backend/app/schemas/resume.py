import uuid
from datetime import datetime
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints, model_validator

# The frontend counts the same normalised text against the same limit.
MAX_RESUME_CHARS = 50_000

Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def _normalise_text(value: str) -> str:
    """One line-ending style (pasted text arrives as CRLF from Windows, CR from old Macs),
    no surrounding blank space, and no NUL characters (Postgres text can't store them;
    PDF copy-paste sometimes includes them)."""
    text = value.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "").strip()
    if not text:
        raise ValueError("Paste the resume text")
    if len(text) > MAX_RESUME_CHARS:
        raise ValueError(f"Resume text must be at most {MAX_RESUME_CHARS:,} characters")
    return text


ResumeText = Annotated[str, AfterValidator(_normalise_text)]


class ResumeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: Label
    content_text: ResumeText
    is_default: bool = False


class ResumeUpdate(BaseModel):
    """PATCH: only sent fields change. `archived: true` hides the version from pickers (and
    clears its default flag); `is_default: true` makes it the default, replacing the old one."""

    model_config = ConfigDict(extra="forbid")

    label: Label | None = None
    content_text: ResumeText | None = None
    is_default: bool | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        if self.archived and self.is_default:
            raise ValueError("An archived resume can't be the default")
        return self


class ResumeSummary(BaseModel):
    """List item: everything except the text itself, which can be 50k characters."""

    id: uuid.UUID
    label: str
    is_default: bool
    archived_at: datetime | None
    char_count: int
    # Applications sent with this version, and match results that used it. Either one
    # above zero means the text is frozen and the version can't be deleted (only archived).
    application_count: int
    match_count: int
    created_at: datetime
    updated_at: datetime


class ResumeRead(ResumeSummary):
    content_text: str

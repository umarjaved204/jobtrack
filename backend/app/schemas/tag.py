import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.common import PaletteColor

TagName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class TagCreate(BaseModel):
    name: TagName
    color: PaletteColor = "ink"


class TagUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: TagName | None = None
    color: PaletteColor | None = None


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str

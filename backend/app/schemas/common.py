from typing import Annotated

from pydantic import BaseModel, StringConstraints

# Colour *names* from the design-token palette (finalised in Phase 4), not raw hex values.
PaletteColor = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z-]{0,19}$")]


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

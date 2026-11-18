from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, AwareDatetime, BaseModel, StringConstraints

# Colour *names* from the design-token palette (finalised in Phase 4), not raw hex values.
PaletteColor = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z-]{0,19}$")]


def _to_utc(value: datetime) -> datetime:
    return value.astimezone(UTC)


# An instant. Input must carry an offset ("2027-03-14T09:00:00-05:00"; a naive time is
# ambiguous and rejected); it is stored as timestamptz and always returned in UTC ("Z"),
# whatever the database session's time zone.
UtcDatetime = Annotated[AwareDatetime, AfterValidator(_to_utc)]


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentUser, DbSession
from app.services import export as service

router = APIRouter(prefix="/export", tags=["export"])


class ExportFormat(StrEnum):
    CSV = "csv"
    JSON = "json"


@router.get(
    "",
    response_class=Response,
    responses={
        200: {
            "content": {"application/json": {}, "application/zip": {}},
            "description": "JSON: one document. CSV: a zip with one file per table.",
        }
    },
)
def export_data(
    user: CurrentUser,
    db: DbSession,
    export_format: Annotated[ExportFormat, Query(alias="format")],
) -> Response:
    """Everything you've entered, as a download (see services/export.py for what's in it)."""
    now = datetime.now(UTC)
    document = service.build_export(db, user, now)
    if export_format is ExportFormat.JSON:
        body, media_type, extension = service.to_json(document), "application/json", "json"
    else:
        body, media_type, extension = service.to_csv_zip(document), "application/zip", "zip"
    filename = f"jobtrack-export-{now:%Y-%m-%d}.{extension}"
    return Response(
        content=body,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Personal data: don't leave copies in shared or browser caches.
            "Cache-Control": "no-store",
        },
    )

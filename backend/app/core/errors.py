"""Domain errors raised by services and translated to HTTP responses in one place.

Services stay free of FastAPI imports; `register_exception_handlers` maps these to
the same `{"detail": "..."}` shape FastAPI uses for its own errors.
"""

from typing import ClassVar

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    status_code: ClassVar[int] = 400
    headers: ClassVar[dict[str, str] | None] = None

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(AppError):
    status_code: ClassVar[int] = 404


class ConflictError(AppError):
    status_code: ClassVar[int] = 409


class UnauthorizedError(AppError):
    status_code: ClassVar[int] = 401
    headers: ClassVar[dict[str, str] | None] = {"WWW-Authenticate": "Bearer"}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers
        )

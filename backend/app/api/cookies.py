"""The refresh-token cookie, set and cleared with identical attributes everywhere."""

from fastapi import Response

from app.core.config import get_settings

# Scoped to the auth endpoints: the browser never sends it to the rest of the API.
REFRESH_COOKIE_PATH = "/api/v1/auth"


def set_refresh_cookie(response: Response, raw_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        httponly=True,  # invisible to JavaScript, so XSS can't steal it
        secure=settings.refresh_cookie_secure,
        samesite="strict",  # the SPA is same-origin and never needs cross-site sends
    )


def clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="strict",
    )

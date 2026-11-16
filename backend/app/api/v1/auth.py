from fastapi import APIRouter, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.cookies import clear_refresh_cookie, set_refresh_cookie
from app.api.deps import DbSession
from app.core.config import get_settings
from app.core.errors import UnauthorizedError
from app.core.security import create_access_token
from app.models import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.schemas.user import UserRead
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id),
        expires_in=get_settings().access_token_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


def _start_session(db: DbSession, response: Response, user: User) -> AuthResponse:
    set_refresh_cookie(response, auth_service.issue_refresh_token(db, user))
    return _auth_response(user)


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: DbSession, response: Response) -> AuthResponse:
    """Create an account and log straight in."""
    user = auth_service.register_user(db, data)
    return _start_session(db, response, user)


@router.post("/login")
def login(data: LoginRequest, db: DbSession, response: Response) -> AuthResponse:
    user = auth_service.authenticate(db, data.email, data.password)
    return _start_session(db, response, user)


@router.post("/refresh", response_model=AuthResponse)
def refresh(request: Request, db: DbSession, response: Response) -> AuthResponse | JSONResponse:
    """Swap the refresh cookie for a new access token (and a rotated refresh cookie).
    The SPA calls this on page load to restore a session, and when an access token expires."""
    raw = request.cookies.get(get_settings().refresh_cookie_name)
    if not raw:
        raise UnauthorizedError("Not authenticated")
    try:
        user, new_raw = auth_service.rotate_refresh_token(db, raw)
    except auth_service.RefreshRaceError:
        # Lost a race with a concurrent refresh: plain 401, cookie untouched (clearing it
        # would delete the newer token the winning request just set in the shared jar).
        raise
    except UnauthorizedError as exc:
        # Dead token: return (not raise) so the cookie is cleared too. Headers set on
        # `response` are discarded when an exception propagates.
        error = JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers
        )
        clear_refresh_cookie(error)
        return error
    set_refresh_cookie(response, new_raw)
    return _auth_response(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: DbSession, response: Response) -> None:
    """Revoke the current refresh token. Idempotent: succeeds even without a session."""
    raw = request.cookies.get(get_settings().refresh_cookie_name)
    if raw:
        auth_service.revoke_refresh_token(db, raw)
    clear_refresh_cookie(response)

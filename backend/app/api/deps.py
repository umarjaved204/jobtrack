"""Shared FastAPI dependencies. Use the Annotated aliases in route signatures."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import UnauthorizedError
from app.core.security import InvalidAccessTokenError, decode_access_token
from app.db.session import get_db
from app.models import User

DbSession = Annotated[Session, Depends(get_db)]

# HTTPBearer (not OAuth2PasswordBearer): login takes JSON, not a form, and Swagger's
# "Authorize" button then simply accepts a pasted access token.
_bearer = HTTPBearer(auto_error=False, description="Access token from /auth/login")


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("Not authenticated")
    try:
        user_id = decode_access_token(credentials.credentials)
    except InvalidAccessTokenError as exc:
        raise UnauthorizedError("Invalid or expired access token") from exc

    user = db.get(User, user_id)
    if user is None:  # token outlived a deleted account
        raise UnauthorizedError("Invalid or expired access token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]

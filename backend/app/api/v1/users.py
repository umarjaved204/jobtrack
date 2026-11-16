from fastapi import APIRouter, Response, status

from app.api.cookies import clear_refresh_cookie
from app.api.deps import CurrentUser, DbSession
from app.models import User
from app.schemas.user import UserRead, UserUpdate
from app.services import users as user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def read_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(data: UserUpdate, user: CurrentUser, db: DbSession) -> User:
    return user_service.update_user(db, user, data)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: CurrentUser, db: DbSession, response: Response) -> None:
    """Permanently delete the account and all its data."""
    user_service.delete_user(db, user)
    clear_refresh_cookie(response)

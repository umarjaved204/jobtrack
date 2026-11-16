from sqlalchemy.orm import Session

from app.models import User
from app.schemas.user import UserUpdate


def update_user(db: Session, user: User, data: UserUpdate) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None:  # all updatable fields are NOT NULL: treat null as "no change"
            continue
        setattr(user, field, value)
    db.commit()
    return user


def delete_user(db: Session, user: User) -> None:
    """Deletes the account; ON DELETE CASCADE removes all of the user's data."""
    db.delete(user)
    db.commit()

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import ThemePreference, str_enum


class User(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # The service lowercases emails; the constraint guarantees uniqueness is case-insensitive.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    theme: Mapped[ThemePreference] = mapped_column(
        str_enum(ThemePreference, "theme"),
        default=ThemePreference.SYSTEM,
        server_default=ThemePreference.SYSTEM.value,
    )
    accent: Mapped[str] = mapped_column(String(20), default="vermilion", server_default="vermilion")


class RefreshToken(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """One row per issued refresh token. Only the SHA-256 hash is stored, never the token.

    Tokens form *families*: each login starts a new family_id and every rotation keeps
    it. Detected reuse revokes one family (one device/session), not the whole account.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]

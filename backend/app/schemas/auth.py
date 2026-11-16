from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field

from app.schemas.user import FullName, UserRead

# Emails are compared case-insensitively everywhere: normalise once at the edge.
NormalizedEmail = Annotated[EmailStr, AfterValidator(lambda v: v.lower())]
# Argon2 has no 72-byte limit (unlike bcrypt); the max only guards against huge payloads.
NewPassword = Annotated[str, Field(min_length=8, max_length=128)]


class RegisterRequest(BaseModel):
    email: NormalizedEmail
    password: NewPassword
    full_name: FullName


class LoginRequest(BaseModel):
    email: NormalizedEmail
    password: Annotated[str, Field(min_length=1, max_length=128)]


class AuthResponse(BaseModel):
    """Returned by register, login and refresh. The refresh token is NOT in the body:
    it's set as an httpOnly cookie so JavaScript can never read it."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105  (not a secret)
    expires_in: int = Field(description="Access token lifetime in seconds")
    user: UserRead

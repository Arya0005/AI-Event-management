from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

ROLES = ("admin", "organizer", "staff")

_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    email: str | None
    role: str
    claims: dict[str, Any] = field(repr=False)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def can_manage(self) -> bool:
        return self.role in ("admin", "organizer")


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json")


def decode_token(token: str) -> dict[str, Any]:
    """Verify a Supabase access token's signature, expiry and audience."""
    settings = get_settings()
    alg = jwt.get_unverified_header(token).get("alg")
    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not configured")
        key: Any = settings.supabase_jwt_secret
    elif alg in ("RS256", "ES256"):
        key = _jwks_client().get_signing_key_from_jwt(token).key
    else:
        raise jwt.InvalidTokenError(f"Unsupported JWT algorithm: {alg}")

    return jwt.decode(
        token,
        key,
        algorithms=[alg],
        audience="authenticated",
        options={"require": ["exp", "sub"]},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = decode_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}",
                            headers={"WWW-Authenticate": "Bearer"}) from exc

    role = (claims.get("app_metadata") or {}).get("role") or "staff"
    if role not in ROLES:
        role = "staff"
    return CurrentUser(id=claims["sub"], email=claims.get("email"), role=role, claims=claims)


def require_roles(*roles: str) -> Callable[[CurrentUser], CurrentUser]:
    def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"Requires role: {' or '.join(roles)}")
        return user
    return checker


require_admin = require_roles("admin")
require_manager = require_roles("admin", "organizer")

import time

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth
from app.config import get_settings

SECRET = "test-secret-at-least-32-bytes-long!!"


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setattr(get_settings(), "supabase_jwt_secret", SECRET)


def _token(**overrides):
    now = int(time.time())
    claims = {"sub": "11111111-1111-1111-1111-111111111111", "aud": "authenticated",
              "exp": now + 300, "iat": now, "email": "a@b.c", "app_metadata": {"role": "organizer"}}
    claims.update(overrides)
    key = claims.pop("_key", SECRET)
    return jwt.encode(claims, key, algorithm="HS256")


def _user(token):
    return auth.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))


def test_valid_token_yields_role():
    user = _user(_token())
    assert user.role == "organizer" and user.can_manage and not user.is_admin


def test_missing_role_defaults_to_staff():
    assert _user(_token(app_metadata={})).role == "staff"


def test_unknown_role_defaults_to_staff():
    assert _user(_token(app_metadata={"role": "superuser"})).role == "staff"


def test_user_metadata_role_is_ignored():
    # user_metadata is user-editable in Supabase, so it must never grant a role.
    assert _user(_token(app_metadata={}, user_metadata={"role": "admin"})).role == "staff"


@pytest.mark.parametrize("overrides", [
    {"_key": "forged-secret-also-32-bytes-long!!!!"},
    {"exp": int(time.time()) - 10},
    {"aud": "anon"},
])
def test_rejects_bad_tokens(overrides):
    with pytest.raises(HTTPException) as exc:
        _user(_token(**overrides))
    assert exc.value.status_code == 401


def test_rejects_alg_none():
    token = jwt.encode({"sub": "x", "aud": "authenticated", "exp": int(time.time()) + 60,
                        "app_metadata": {"role": "admin"}}, None, algorithm="none")
    with pytest.raises(HTTPException):
        _user(token)


def test_require_roles():
    check = auth.require_roles("admin")
    with pytest.raises(HTTPException) as exc:
        check(_user(_token()))
    assert exc.value.status_code == 403

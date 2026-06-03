import time
from typing import Any

import jwt

from app.core.config import settings


JWT_ALGORITHM = "HS256"
OAUTH_STATE_TTL_SECONDS = 60 * 10


def create_access_token(payload: dict[str, Any]) -> str:
    now = int(time.time())
    body = {
        **payload,
        "iat": now,
        "exp": now + settings.AUTH_TOKEN_TTL_SECONDS,
    }
    return jwt.encode(body, settings.AUTH_SECRET, algorithm=JWT_ALGORITHM)


def verify_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.AUTH_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload


def create_oauth_state(payload: dict[str, Any] | None = None) -> str:
    now = int(time.time())
    body = {
        **(payload or {}),
        "kind": "google_oauth_state",
        "iat": now,
        "exp": now + OAUTH_STATE_TTL_SECONDS,
    }
    return jwt.encode(body, settings.AUTH_SECRET, algorithm=JWT_ALGORITHM)


def verify_oauth_state(state: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(state, settings.AUTH_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("kind") != "google_oauth_state":
        return None
    return payload

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    create_access_token,
    create_oauth_state,
    verify_oauth_state,
)
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.schemas.auth import AuthUser, GoogleLoginRequest, GoogleLoginResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def _fetch_google_token_info(id_token: str) -> dict[str, Any]:
    query = urlencode({"id_token": id_token})
    with urlopen(f"https://oauth2.googleapis.com/tokeninfo?{query}", timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _exchange_google_code(code: str) -> dict[str, Any]:
    form = urlencode(
        {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")
    request = Request(
        GOOGLE_TOKEN_URL,
        data=form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


async def _verify_google_id_token(id_token: str) -> dict[str, Any]:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="GOOGLE_CLIENT_ID is not configured")

    try:
        token_info = await asyncio.to_thread(_fetch_google_token_info, id_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Google ID token") from exc

    if token_info.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Google token audience mismatch")

    if token_info.get("email_verified") not in {True, "true", "True"}:
        raise HTTPException(status_code=401, detail="Google email is not verified")

    if not token_info.get("sub") or not token_info.get("email"):
        raise HTTPException(status_code=401, detail="Google token is missing user identity")

    return token_info


async def _exchange_and_verify_google_code(code: str) -> dict[str, Any]:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="GOOGLE_CLIENT_ID is not configured")
    if not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="GOOGLE_CLIENT_SECRET is not configured")
    if not settings.GOOGLE_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="GOOGLE_REDIRECT_URI is not configured")

    try:
        token_response = await asyncio.to_thread(_exchange_google_code, code)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Failed to exchange Google code") from exc

    id_token = token_response.get("id_token")
    if not id_token:
        raise HTTPException(status_code=401, detail="Google token response is missing id_token")
    return await _verify_google_id_token(str(id_token))


def _to_auth_user(user: User) -> AuthUser:
    return AuthUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatarUrl=user.avatar_url,
    )


async def _upsert_google_user(token_info: dict[str, Any], db: AsyncSession) -> User:
    google_sub = str(token_info["sub"])
    email = str(token_info["email"])
    name = str(token_info.get("name") or email.split("@", 1)[0])
    avatar_url = token_info.get("picture")

    result = await db.execute(select(User).where(User.google_sub == google_sub))
    user = result.scalar_one_or_none()
    now = datetime.utcnow()

    if user is None:
        user = User(
            id=f"u_{uuid.uuid4().hex[:12]}",
            email=email,
            name=name,
            avatar_url=avatar_url,
            google_sub=google_sub,
            last_login_at=now,
        )
        db.add(user)
    else:
        user.email = email
        user.name = name
        user.avatar_url = avatar_url
        user.last_login_at = now

    await db.commit()
    await db.refresh(user)
    return user


@router.get("/google/start")
async def start_google_login(next: str | None = Query(default=None)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="GOOGLE_CLIENT_ID is not configured")
    if not settings.GOOGLE_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="GOOGLE_REDIRECT_URI is not configured")

    state = create_oauth_state({"next": next} if next else None)
    query = urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{query}", status_code=302)


@router.get("/google/callback")
async def google_oauth_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    if error:
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing Google OAuth code")
    if not state:
        raise HTTPException(status_code=400, detail="Missing Google OAuth state")

    state_payload = verify_oauth_state(state)
    if state_payload is None:
        raise HTTPException(status_code=400, detail="Invalid Google OAuth state")

    token_info = await _exchange_and_verify_google_code(code)
    user = await _upsert_google_user(token_info, db)
    access_token = create_access_token({"sub": user.id, "email": user.email})

    redirect_url = str(state_payload.get("next") or settings.FRONTEND_AUTH_REDIRECT_URL)
    separator = "&" if "?" in redirect_url else "?"
    query = urlencode(
        {
            "accessToken": access_token,
            "tokenType": "bearer",
            "expiresIn": settings.AUTH_TOKEN_TTL_SECONDS,
        }
    )
    return RedirectResponse(f"{redirect_url}{separator}{query}", status_code=302)


@router.post("/google", response_model=GoogleLoginResponse)
async def login_with_google(
    payload: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    token_info = await _verify_google_id_token(payload.idToken)
    user = await _upsert_google_user(token_info, db)
    access_token = create_access_token({"sub": user.id, "email": user.email})
    return GoogleLoginResponse(
        accessToken=access_token,
        expiresIn=settings.AUTH_TOKEN_TTL_SECONDS,
        user=_to_auth_user(user),
    )


@router.get("/me", response_model=AuthUser)
async def read_current_user(
    user: User = Depends(get_current_user),
):
    return _to_auth_user(user)

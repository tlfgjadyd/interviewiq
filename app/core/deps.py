from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import verify_access_token
from app.db.database import get_db
from app.db.models import User


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token_payload = verify_access_token(credentials.credentials)
    if token_payload is None:
        raise HTTPException(status_code=401, detail="Invalid bearer token")

    result = await db.execute(select(User).where(User.id == token_payload.get("sub")))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

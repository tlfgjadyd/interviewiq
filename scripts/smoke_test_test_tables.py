import asyncio
import os
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

import asyncpg
from dotenv import load_dotenv


PREFIX_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def get_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL", "").strip()
    if raw_url:
        return raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    user = os.getenv("POSTGRES_USER", "")
    password = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    database = os.getenv("POSTGRES_DB", "")
    if not user or not database:
        raise RuntimeError("DATABASE_URL or POSTGRES_USER/POSTGRES_DB must be configured")

    auth = quote(user, safe="")
    if password:
        auth = f"{auth}:{quote(password, safe='')}"
    return f"postgresql://{auth}@{host}:{port}/{database}"


def table(name: str) -> str:
    prefix = os.getenv("DB_TABLE_PREFIX", "ii_test_")
    full_name = f"{prefix}{name}"
    if not PREFIX_PATTERN.match(full_name):
        raise RuntimeError(f"Unsafe table name: {full_name}")
    return full_name


async def main() -> None:
    load_dotenv()
    conn = await asyncpg.connect(get_database_url())
    try:
        now = datetime.now(timezone.utc)
        user_id = f"u_smoke_{uuid.uuid4().hex[:8]}"
        google_sub = f"smoke_{uuid.uuid4().hex}"
        email = f"{google_sub}@example.test"

        inserted = await conn.fetchrow(
            f"""
            insert into {table("users")} (
                id,
                email,
                name,
                avatar_url,
                google_sub,
                last_login_at
            )
            values ($1, $2, $3, $4, $5, $6)
            returning id, email, name, google_sub, created_at, last_login_at
            """,
            user_id,
            email,
            "Smoke Test User",
            "https://example.test/avatar.png",
            google_sub,
            now,
        )

        count = await conn.fetchval(f"select count(*) from {table('users')}")
        fetched = await conn.fetchrow(
            f"select id, email, name, google_sub from {table('users')} where id = $1",
            user_id,
        )

        print("inserted_user=", dict(inserted))
        print("fetched_user=", dict(fetched))
        print(f"{table('users')}_count=", count)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

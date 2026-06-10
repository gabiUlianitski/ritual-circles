import asyncio
import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("NO_DATABASE_URL")
        return
    conn = await asyncpg.connect(url)
    row = await conn.fetchrow(
        """
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'circles'::regclass AND conname = 'circles_maxSize_check'
        """
    )
    if row:
        sql = Path(__file__).resolve().parents[2] / "db" / "migrations" / "024_drop_legacy_maxsize_check.sql"
        await conn.execute(sql.read_text(encoding="utf-8"))
        print("Dropped legacy circles_maxSize_check")
    else:
        print("circles_maxSize_check already absent")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

import asyncpg

load_dotenv()


async def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("NO_DATABASE_URL")
        return
    conn = await asyncpg.connect(url)
    cols = await conn.fetch(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'languages_json'
        """
    )
    print("languages_json exists:", bool(cols))
    if not cols:
        sql = Path(__file__).resolve().parents[2] / "db" / "migrations" / "015_user_languages.sql"
        await conn.execute(sql.read_text(encoding="utf-8"))
        print("Applied migration 015")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

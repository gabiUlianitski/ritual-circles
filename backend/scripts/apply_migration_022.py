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
    cols = await conn.fetch(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'circles' AND column_name = 'group_size_json'
        """
    )
    if cols:
        print("group_size_json exists")
    else:
        sql = Path(__file__).resolve().parents[2] / "db" / "migrations" / "022_circle_group_size.sql"
        await conn.execute(sql.read_text(encoding="utf-8"))
        print("Applied migration 022")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

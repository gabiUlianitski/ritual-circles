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
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'hobies' AND column_name = 'group_size_json'
        """
    )
    if row:
        print("group_size_json already present on hobies")
    else:
        sql = Path(__file__).resolve().parents[2] / "db" / "migrations" / "025_hoby_group_size.sql"
        await conn.execute(sql.read_text(encoding="utf-8"))
        print("Added hobies.group_size_json")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

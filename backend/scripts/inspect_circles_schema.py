import asyncio
import os
from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("NO_DATABASE_URL")
        return
    import asyncpg

    conn = await asyncpg.connect(url)
    cols = await conn.fetch(
        """
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'circles' ORDER BY ordinal_position
        """
    )
    print("COLUMNS:")
    for r in cols:
        print(f"  {r['column_name']}: {r['data_type']}")
    checks = await conn.fetch(
        """
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint WHERE conrelid = 'circles'::regclass
        """
    )
    print("CONSTRAINTS:")
    for r in checks:
        print(f"  {r['conname']}: {r['def']}")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

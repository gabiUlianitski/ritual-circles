"""Diagnose circle create against Supabase. Set SUPABASE_DATABASE_URL + DATABASE_SSL=require."""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

URL = os.getenv("SUPABASE_DATABASE_URL") or os.getenv("TARGET_DATABASE_URL")


async def main() -> None:
    if not URL:
        print("Set SUPABASE_DATABASE_URL", file=sys.stderr)
        sys.exit(1)

    import asyncpg
    from app.schemas import CircleCreateRequest, CirclePaymentSpec, GroupSizeSpec
    from app.services.circles_service import create_circle

    ssl = "require" if "supabase.com" in URL or os.getenv("DATABASE_SSL") else None
    conn = await asyncpg.connect(URL, ssl=ssl)

    cols = await conn.fetch(
        """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'circles'
        ORDER BY ordinal_position
        """
    )
    print("circles columns:")
    for c in cols:
        print(f"  {c['column_name']}: {c['data_type']}")

    user = await conn.fetchrow("SELECT id FROM users ORDER BY created_at DESC NULLS LAST LIMIT 1")
    if not user:
        print("NO USERS in Supabase")
        await conn.close()
        return

    print(f"user: {user['id']}")

    payload = CircleCreateRequest(
        ritualType="bicycle",
        ritualLevel=1,
        ritualSubtype="road_bike",
        modality="offline",
        recurringTime="Sun 17:00",
        isRecurring=True,
        countryCode="IL",
        cityName="Jerusalem",
        meetingPlace="Raban Yohanan ben Zakai St, Jerusalem",
        inviteOnly=False,
        firstSessionAt=datetime(2026, 6, 21, 14, 0, tzinfo=timezone.utc),
        groupSize=GroupSizeSpec(type="min", min=3),
        costPayment=CirclePaymentSpec(type="free", currency="USD"),
    )

    try:
        result = await create_circle(conn, user_id=user["id"], payload=payload)
        print("SUCCESS", result.id)
        await conn.execute(
            'DELETE FROM attendance WHERE "sessionId" IN (SELECT id FROM sessions WHERE "circleId" = $1)',
            result.id,
        )
        await conn.execute('DELETE FROM sessions WHERE "circleId" = $1', result.id)
        await conn.execute("DELETE FROM circles WHERE id = $1", result.id)
        print("cleaned up test circle")
    except Exception as e:
        print(f"ERROR {type(e).__name__}: {e}")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

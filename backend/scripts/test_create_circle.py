import asyncio
import os
from datetime import datetime, timezone
from uuid import UUID

from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("NO_DATABASE_URL")
        return
    import asyncpg
    from app.schemas import CircleCreateRequest, CirclePaymentSpec, GroupSizeSpec
    from app.services.circles_service import create_circle

    conn = await asyncpg.connect(url)
    user = await conn.fetchrow("SELECT id FROM users LIMIT 1")
    if not user:
        print("NO_USERS")
        await conn.close()
        return
    user_id = user["id"]
    print(f"Using user {user_id}")

    payload = CircleCreateRequest(
        ritualType="cooking",
        ritualLevel="advanced",
        ritualSubtype="baking",
        modality="offline",
        recurringTime="Fri 17:00",
        isRecurring=True,
        countryCode="IL",
        cityName="Raanana",
        meetingPlace="Prima Millennium Raanana",
        inviteOnly=False,
        firstSessionAt=datetime(2026, 6, 12, 14, 0, tzinfo=timezone.utc),
        groupSize=GroupSizeSpec(type="min", min=2),
        costPayment=CirclePaymentSpec(type="free"),
    )

    try:
        result = await create_circle(conn, user_id=user_id, payload=payload)
        print("SUCCESS", result.id, result.inviteCode)
        # cleanup test circle
        await conn.execute('DELETE FROM attendance WHERE "sessionId" IN (SELECT id FROM sessions WHERE "circleId" = $1)', UUID(result.id))
        await conn.execute('DELETE FROM sessions WHERE "circleId" = $1', UUID(result.id))
        await conn.execute("DELETE FROM circles WHERE id = $1", UUID(result.id))
        print("Cleaned up test circle")
    except Exception as e:
        print("ERROR", type(e).__name__, e)
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

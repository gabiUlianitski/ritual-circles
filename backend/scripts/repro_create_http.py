import asyncio
import os
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("NO_DATABASE_URL")
        return
    import asyncpg
    from fastapi.testclient import TestClient
    from app.main import app
    from app.auth.jwt import create_token

    conn = await asyncpg.connect(url)
    user = await conn.fetchrow("SELECT id FROM users ORDER BY created_at DESC NULLS LAST LIMIT 1")
    await conn.close()
    if not user:
        print("NO_USERS")
        return

    token = create_token(user["id"])
    payload = {
        "ritualType": "cooking",
        "ritualLevel": "advanced",
        "ritualSubtype": "baking",
        "modality": "offline",
        "recurringTime": "Fri 17:00",
        "isRecurring": True,
        "countryCode": "IL",
        "cityName": "Raanana",
        "meetingPlace": "Prima Millennium Raanana",
        "inviteOnly": False,
        "firstSessionAt": datetime(2026, 6, 12, 14, 0, 0, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "groupSize": {"type": "min", "min": 2},
        "costPayment": {"type": "free", "currency": "USD"},
    }

    with TestClient(app) as client:
        r = client.post("/circles", json=payload, headers={"Authorization": f"Bearer {token}"})
        print("STATUS", r.status_code)
        print(r.text[:2000])
        if r.status_code == 200:
            cid = r.json()["id"]
            with TestClient(app) as c2:
                # cleanup via direct db
                pass
            conn2 = await asyncpg.connect(url)
            await conn2.execute(
                'DELETE FROM attendance WHERE "sessionId" IN (SELECT id FROM sessions WHERE "circleId" = $1::uuid)',
                cid,
            )
            await conn2.execute('DELETE FROM sessions WHERE "circleId" = $1::uuid', cid)
            await conn2.execute("DELETE FROM circles WHERE id = $1::uuid", cid)
            await conn2.close()
            print("cleaned up")


if __name__ == "__main__":
    asyncio.run(main())

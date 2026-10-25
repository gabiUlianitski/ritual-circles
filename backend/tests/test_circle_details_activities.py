"""Circle Details reads meetups from Activities only. Rolls back and keeps no rows."""

from __future__ import annotations

import os
import unittest
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv

from app.deps import CurrentUser
from app.routers.circles import get_my_circle
from app.schemas import CircleMeResponse
from app.services.activities_service import create_activity, get_activity, list_activities_for_circle, publish_activity
from app.services.activity_participants import join_activity, join_occurrence, leave_activity
from app.services.home_query import fetch_home
from tests.test_activities import ROOT, _create_payload


class CircleDetailsActivitiesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        load_dotenv(ROOT / "backend" / ".env")
        url = os.getenv("DATABASE_URL")
        if not url:
            self.skipTest("DATABASE_URL missing")
        try:
            self.conn = await asyncpg.connect(url)
        except Exception as exc:
            self.skipTest(f"database unavailable: {exc.__class__.__name__}")
        self.tx = self.conn.transaction()
        await self.tx.start()
        row = await self.conn.fetchrow(
            """
            SELECT c.id AS circle_id, m.user_id
            FROM circles c
            JOIN circle_members m ON m.circle_id = c.id AND m.status = 'active'
            LIMIT 1
            """
        )
        if not row:
            self.skipTest("no active circle member")
        self.circle_id = row["circle_id"]
        self.member_id = row["user_id"]
        self.user = CurrentUser(id=self.member_id)

    async def asyncTearDown(self) -> None:
        tx = getattr(self, "tx", None)
        conn = getattr(self, "conn", None)
        if tx is not None:
            await tx.rollback()
        if conn is not None:
            await conn.close()

    async def _circle_details(self) -> CircleMeResponse:
        return await get_my_circle(circleId=str(self.circle_id), conn=self.conn, user=self.user, lang="en")

    async def _drop_sessions(self) -> None:
        await self.conn.execute(
            'DELETE FROM attendance WHERE "sessionId" IN (SELECT id FROM sessions WHERE "circleId" = $1)',
            self.circle_id,
        )
        await self.conn.execute('DELETE FROM sessions WHERE "circleId" = $1', self.circle_id)

    async def _attendance_rows(self) -> int:
        return int(await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance"))

    async def _plan(self, **overrides: object):
        created = await create_activity(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=_create_payload(**overrides)
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def test_a_circle_details_needs_no_future_session(self) -> None:
        await self._drop_sessions()
        details = await self._circle_details()
        self.assertIsNotNone(details.circle)
        self.assertEqual(details.circle.id, str(self.circle_id))
        self.assertIn(str(self.member_id), [m.id for m in details.members])
        self.assertNotIn("nextSessionAt", CircleMeResponse.model_fields)
        self.assertNotIn("nextSessionRoster", CircleMeResponse.model_fields)

    async def test_b_circle_with_activities_but_no_sessions_loads(self) -> None:
        await self._drop_sessions()
        plan = await self._plan(title="Court booking")
        weekly = await self._plan(title="Weekly walk", recurrenceType="recurring", recurrenceRule="Mon 18:00")
        details = await self._circle_details()
        self.assertIsNotNone(details.circle)
        listed = {item.id: item for item in await list_activities_for_circle(
            self.conn, user_id=self.member_id, circle_id=self.circle_id
        )}
        self.assertIn(plan.id, listed)
        self.assertIn(weekly.id, listed)
        self.assertIsNotNone(listed[weekly.id].nextOccurrence)
        self.assertEqual(
            await self.conn.fetchval('SELECT COUNT(*)::int FROM sessions WHERE "circleId" = $1', self.circle_id),
            0,
        )

    async def test_c_activity_actions_from_circle_details_write_no_attendance(self) -> None:
        before = await self._attendance_rows()
        plan = await self._plan()
        weekly = await self._plan(recurrenceType="recurring", recurrenceRule="Mon 18:00")
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await join_occurrence(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(weekly.occurrences[0].id),
        )
        await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await self._circle_details()
        self.assertEqual(await self._attendance_rows(), before)

    async def test_d_participation_comes_from_activity_tables(self) -> None:
        plan = await self._plan(groupSize=3)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await self.conn.execute(
            """
            UPDATE attendance SET status = 'attending'
            WHERE "userId" = $1 AND "sessionId" IN (SELECT id FROM sessions WHERE "circleId" = $2)
            """,
            self.member_id,
            self.circle_id,
        )
        listed = {item.id: item for item in await list_activities_for_circle(
            self.conn, user_id=self.member_id, circle_id=self.circle_id
        )}
        self.assertEqual(listed[plan.id].participation.goingCount, 1)
        self.assertEqual(listed[plan.id].participation.currentUserStatus, "going")
        await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        listed = {item.id: item for item in await list_activities_for_circle(
            self.conn, user_id=self.member_id, circle_id=self.circle_id
        )}
        self.assertEqual(listed[plan.id].participation.goingCount, 0)
        self.assertNotEqual(listed[plan.id].participation.currentUserStatus, "going")

    async def test_e_legacy_session_is_kept_but_not_shown(self) -> None:
        session_id = uuid4()
        await self.conn.execute(
            """
            INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
            VALUES ($1, $2, NOW() + INTERVAL '1 hour', 'Legacy place')
            """,
            session_id,
            self.circle_id,
        )
        await self.conn.execute(
            """
            INSERT INTO attendance ("userId", "sessionId", status)
            VALUES ($1, $2, 'not_attending')
            ON CONFLICT DO NOTHING
            """,
            self.member_id,
            session_id,
        )
        sessions_before = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance_before = await self._attendance_rows()
        details = await self._circle_details()
        home = await fetch_home(self.conn, self.member_id)
        self.assertNotIn(str(session_id), details.model_dump_json())
        self.assertNotIn(str(session_id), home.model_dump_json())
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions"), sessions_before)
        self.assertEqual(await self._attendance_rows(), attendance_before)
        self.assertEqual(
            await self.conn.fetchval('SELECT "locationOrLink" FROM sessions WHERE id = $1', session_id),
            "Legacy place",
        )


if __name__ == "__main__":
    unittest.main()

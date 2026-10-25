"""Home upcoming Activities come from Activity participation only. Rolls back and keeps no rows."""

from __future__ import annotations

import os
import unittest
from datetime import timedelta
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv

from app.services.activities_service import cancel_activity, create_activity, publish_activity
from app.services.activity_participants import join_activity, join_occurrence
from app.services.circle_members import activate_member
from app.services.home_activities import fetch_home_activities
from app.services.home_query import fetch_home
from tests.test_activities import ROOT, _create_payload, _start


class HomeActivitiesTests(unittest.IsolatedAsyncioTestCase):
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
            SELECT c.id AS circle_id, m.user_id, c.created_by
            FROM circles c
            JOIN circle_members m ON m.circle_id = c.id AND m.status = 'active'
            LIMIT 1
            """
        )
        if not row:
            self.skipTest("no active circle member")
        self.circle_id = row["circle_id"]
        self.member_id = row["user_id"]
        self.owner_id = row["created_by"]

    async def asyncTearDown(self) -> None:
        tx = getattr(self, "tx", None)
        conn = getattr(self, "conn", None)
        if tx is not None:
            await tx.rollback()
        if conn is not None:
            await conn.close()

    async def _one_time(self, **overrides: object):
        created = await create_activity(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=_create_payload(**overrides)
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _weekly(self, **overrides: object):
        payload = _create_payload(recurrenceType="recurring", recurrenceRule="Mon 18:00", **overrides)
        created = await create_activity(self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=payload)
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _join_date(self, activity_id: str, occurrence_id: str, user_id: UUID | None = None) -> None:
        await join_occurrence(
            self.conn,
            user_id=user_id or self.member_id,
            activity_id=UUID(activity_id),
            occurrence_id=UUID(occurrence_id),
        )

    async def _mine(self, user_id: UUID | None = None, *, ids: set[str]) -> list:
        items = await fetch_home_activities(self.conn, user_id or self.member_id)
        return [item for item in items if item.activityId in ids]

    async def _other(self) -> UUID:
        other = await self.conn.fetchval(
            "SELECT id FROM users WHERE id <> $1 AND id <> $2 LIMIT 1",
            self.member_id,
            self.owner_id,
        )
        if other is None:
            self.skipTest("needs another user")
        await activate_member(self.conn, user_id=other, circle_id=self.circle_id)
        return other

    async def _counts(self) -> tuple[int, int]:
        sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        return int(sessions), int(attendance)

    async def test_a_joined_one_time_activity_appears(self) -> None:
        plan = await self._one_time(title="Court booking", locationName="Club", locationAddress="Main St 1")
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        items = await self._mine(ids={plan.id})
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertIsNone(item.occurrenceId)
        self.assertFalse(item.isRecurring)
        self.assertEqual(item.title, "Court booking")
        self.assertEqual(item.circleId, str(self.circle_id))
        self.assertEqual(item.startAt, _start())
        self.assertEqual(item.locationName, "Club")
        self.assertEqual(item.locationAddress, "Main St 1")
        self.assertEqual(item.participation.currentUserStatus, "going")
        self.assertEqual(item.participation.goingCount, 1)
        self.assertEqual(item.participation.groupSize, 4)
        self.assertEqual(item.participation.remainingPlaces, 3)
        self.assertTrue(item.circleName)

    async def test_b_membership_without_joining_shows_nothing(self) -> None:
        other = await self._other()
        plan = await self._one_time()
        weekly = await self._weekly()
        self.assertEqual(await self._mine(other, ids={plan.id, weekly.id}), [])
        self.assertEqual(await self._mine(ids={plan.id, weekly.id}), [])

    async def test_c_one_recurring_date_joined_gives_one_entry(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await self._join_date(weekly.id, first.id)
        items = await self._mine(ids={weekly.id})
        self.assertEqual([item.occurrenceId for item in items], [first.id])
        self.assertTrue(items[0].isRecurring)
        self.assertEqual(items[0].startAt, first.startAt)

    async def test_d_only_the_joined_dates_appear(self) -> None:
        weekly = await self._weekly()
        a, b, c = weekly.occurrences[0], weekly.occurrences[1], weekly.occurrences[2]
        await self._join_date(weekly.id, a.id)
        await self._join_date(weekly.id, c.id)
        ids = [item.occurrenceId for item in await self._mine(ids={weekly.id})]
        self.assertEqual(ids, [a.id, c.id])
        self.assertNotIn(b.id, ids)

    async def test_e_mixed_entries_are_chronological(self) -> None:
        weekly = await self._weekly()
        plan = await self._one_time(startAt=_start() + timedelta(days=7, hours=1))
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await self._join_date(weekly.id, weekly.occurrences[0].id)
        await self._join_date(weekly.id, weekly.occurrences[2].id)
        items = await self._mine(ids={weekly.id, plan.id})
        self.assertEqual(
            [(item.activityId, item.occurrenceId) for item in items],
            [
                (weekly.id, weekly.occurrences[0].id),
                (plan.id, None),
                (weekly.id, weekly.occurrences[2].id),
            ],
        )
        starts = [item.startAt for item in items]
        self.assertEqual(starts, sorted(starts))

    async def test_f_cancelled_activities_and_dates_are_excluded(self) -> None:
        plan = await self._one_time()
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await self._join_date(weekly.id, first.id)
        await self._join_date(weekly.id, second.id)
        await cancel_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        self.assertEqual([item.occurrenceId for item in await self._mine(ids={plan.id, weekly.id})], [second.id])
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(await self._mine(ids={plan.id, weekly.id}), [])

    async def test_g_completed_activities_are_excluded(self) -> None:
        plan = await self._one_time()
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await self.conn.execute("UPDATE activities SET status = 'completed' WHERE id = $1", UUID(plan.id))
        weekly = await self._weekly()
        await self._join_date(weekly.id, weekly.occurrences[0].id)
        await self.conn.execute(
            "UPDATE activity_occurrences SET status = 'completed' WHERE id = $1", UUID(weekly.occurrences[0].id)
        )
        self.assertEqual(await self._mine(ids={plan.id, weekly.id}), [])

    async def test_h_ended_entries_are_excluded(self) -> None:
        plan = await self._one_time()
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await self._join_date(weekly.id, first.id)
        await self._join_date(weekly.id, second.id)
        await self.conn.execute(
            "UPDATE activities SET start_at = NOW() - INTERVAL '3 hours', end_at = NOW() - INTERVAL '1 hour' WHERE id = $1",
            UUID(plan.id),
        )
        await self.conn.execute(
            "UPDATE activity_occurrences SET start_at = NOW() - INTERVAL '3 hours', end_at = NULL WHERE id = $1",
            UUID(first.id),
        )
        self.assertEqual([item.occurrenceId for item in await self._mine(ids={plan.id, weekly.id})], [second.id])

    async def test_i_full_activity_still_shows_for_a_joined_user(self) -> None:
        plan = await self._one_time(groupSize=1)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        items = await self._mine(ids={plan.id})
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0].participation.isFull)
        self.assertEqual(items[0].participation.remainingPlaces, 0)

    async def test_j_confirmation_required_is_exposed(self) -> None:
        plan = await self._one_time()
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await self._join_date(weekly.id, first.id)
        await self.conn.execute(
            "UPDATE activity_participants SET confirmation_required = TRUE WHERE activity_id = $1",
            UUID(plan.id),
        )
        await self.conn.execute(
            "UPDATE activity_occurrence_participants SET confirmation_required = TRUE WHERE occurrence_id = $1",
            UUID(first.id),
        )
        items = await self._mine(ids={plan.id, weekly.id})
        self.assertEqual(len(items), 2)
        self.assertTrue(all(item.participation.confirmationRequired for item in items))

    async def test_k_date_location_override_wins(self) -> None:
        weekly = await self._weekly(locationName="Usual court", locationAddress="Park 1")
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await self._join_date(weekly.id, first.id)
        await self._join_date(weekly.id, second.id)
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET location_name_override = 'Indoor hall', location_address_override = 'Hall St 5'
            WHERE id = $1
            """,
            UUID(first.id),
        )
        items = await self._mine(ids={weekly.id})
        self.assertEqual((items[0].locationName, items[0].locationAddress), ("Indoor hall", "Hall St 5"))
        self.assertEqual((items[1].locationName, items[1].locationAddress), ("Usual court", "Park 1"))

    async def test_l_legacy_attendance_alone_adds_no_activity(self) -> None:
        session_id = uuid4()
        await self.conn.execute(
            """
            INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
            VALUES ($1, $2, NOW() + INTERVAL '2 days', 'Legacy place')
            """,
            session_id,
            self.circle_id,
        )
        await self.conn.execute(
            """
            INSERT INTO attendance ("userId", "sessionId", status)
            VALUES ($1, $2, 'attending')
            ON CONFLICT DO NOTHING
            """,
            self.member_id,
            session_id,
        )
        home = await fetch_home(self.conn, self.member_id)
        self.assertNotIn(str(session_id), home.model_dump_json())
        entry_ids = {item.activityId for item in home.upcomingActivities} | {
            item.occurrenceId for item in home.upcomingActivities if item.occurrenceId
        }
        self.assertNotIn(str(session_id), entry_ids)
        for item in home.upcomingActivities:
            self.assertEqual(item.participation.currentUserStatus, "going")

    async def test_m_reading_home_activities_writes_no_sessions_or_attendance(self) -> None:
        plan = await self._one_time()
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        weekly = await self._weekly()
        await self._join_date(weekly.id, weekly.occurrences[0].id)
        before = await self._counts()
        await fetch_home_activities(self.conn, self.member_id)
        self.assertEqual(await self._counts(), before)

    async def test_n_reading_home_tops_up_joined_series(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await self._join_date(weekly.id, first.id)
        await self.conn.execute(
            "DELETE FROM activity_occurrences WHERE activity_id = $1 AND id <> $2",
            UUID(weekly.id),
            UUID(first.id),
        )
        items = await self._mine(ids={weekly.id})
        self.assertEqual([item.occurrenceId for item in items], [first.id])
        usable = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM activity_occurrences
            WHERE activity_id = $1 AND scheduled_at > NOW() AND status IN ('open', 'confirmed')
            """,
            UUID(weekly.id),
        )
        self.assertEqual(usable, 6)
        again = await self._mine(ids={weekly.id})
        self.assertEqual([item.occurrenceId for item in again], [first.id])

    async def test_o_no_joined_activities_gives_empty_list(self) -> None:
        other = await self._other()
        await self.conn.execute(
            "UPDATE activity_participants SET status = 'cancelled' WHERE user_id = $1", other
        )
        await self.conn.execute(
            "UPDATE activity_occurrence_participants SET status = 'cancelled' WHERE user_id = $1", other
        )
        self.assertEqual(await fetch_home_activities(self.conn, other), [])
        home = await fetch_home(self.conn, other)
        self.assertEqual(home.upcomingActivities, [])


if __name__ == "__main__":
    unittest.main()

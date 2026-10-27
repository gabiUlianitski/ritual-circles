"""Activity readiness and creator auto-join. Database checks roll back and keep no rows."""

from __future__ import annotations

import math
import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv

from app.services.activities_service import (
    cancel_activity,
    confirm_activity,
    create_activity,
    ensure_future_activity_occurrences,
    publish_activity,
)
from app.services.activity_participants import join_activity, join_occurrence, leave_activity, leave_occurrence
from app.services.activity_recurrence import ROLLING_DATES
from app.services.circle_members import activate_member
from tests.test_activities import ROOT, _create_payload

MIGRATION = ROOT / "db" / "migrations" / "047_activity_min_participants.sql"


class MinimumMigrationTests(unittest.TestCase):
    def test_migration_backfills_minimum_from_group_size_without_touching_other_tables(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("set min_participants = group_size", sql)
        self.assertIn("alter column min_participants set not null", sql)
        self.assertIn("min_participants >= 1", sql)
        self.assertIn("min_participants <= group_size", sql)
        self.assertNotIn("circle_members", sql)
        self.assertNotIn("activity_participants", sql)
        self.assertNotIn("activity_notifications", sql)
        self.assertNotIn("sessions", sql)
        self.assertNotIn("attendance", sql)


class ReadinessDatabaseTests(unittest.IsolatedAsyncioTestCase):
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
        ready = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM information_schema.columns
            WHERE table_name = 'activities' AND column_name = 'min_participants'
            """
        )
        if int(ready or 0) != 1:
            self.skipTest("activities.min_participants is not installed")
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

    async def _others(self, limit: int) -> list[UUID]:
        rows = await self.conn.fetch(
            "SELECT id FROM users WHERE id <> $1 AND id <> $2 LIMIT $3",
            self.member_id,
            self.owner_id,
            limit,
        )
        people = [row["id"] for row in rows]
        if len(people) < limit:
            self.skipTest("needs more users")
        for person in people:
            await activate_member(self.conn, user_id=person, circle_id=self.circle_id)
        return people

    async def _open(self, **overrides: object):
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(**overrides),
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _weekly(self, **overrides: object):
        payload = _create_payload(recurrenceType="recurring", recurrenceRule="Mon 18:00", **overrides)
        created = await create_activity(self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=payload)
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _status(self, activity_id: str) -> str:
        return await self.conn.fetchval("SELECT status FROM activities WHERE id = $1", UUID(activity_id))

    async def _weeks_pass(self, activity_id: str, passed: int) -> None:
        slots = [
            row["scheduled_at"]
            for row in await self.conn.fetch(
                "SELECT scheduled_at FROM activity_occurrences WHERE activity_id = $1 ORDER BY scheduled_at",
                UUID(activity_id),
            )
        ]
        weeks = math.ceil((slots[passed - 1] - datetime.now(timezone.utc)) / timedelta(weeks=1))
        if weeks <= 0:
            return
        shift = timedelta(weeks=weeks).total_seconds()
        await self.conn.execute(
            """
            UPDATE activities
            SET start_at = start_at - make_interval(secs => $2::float8),
                end_at = end_at - make_interval(secs => $2::float8)
            WHERE id = $1
            """,
            UUID(activity_id),
            shift,
        )
        far = timedelta(days=36500).total_seconds()
        for step in (shift + far, -far):
            await self.conn.execute(
                """
                UPDATE activity_occurrences
                SET start_at = start_at - make_interval(secs => $2::float8),
                    end_at = end_at - make_interval(secs => $2::float8),
                    scheduled_at = scheduled_at - make_interval(secs => $2::float8)
                WHERE activity_id = $1
                """,
                UUID(activity_id),
                step,
            )

    async def test_existing_rows_satisfy_minimum_and_related_columns_remain(self) -> None:
        invalid = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM activities
            WHERE min_participants IS NULL OR min_participants < 1 OR min_participants > group_size
            """
        )
        self.assertEqual(int(invalid), 0)
        required = await self.conn.fetchval(
            """
            SELECT is_nullable FROM information_schema.columns
            WHERE table_name = 'activities' AND column_name = 'min_participants'
            """
        )
        self.assertEqual(required, "NO")
        attendance = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM information_schema.columns
            WHERE table_name IN ('activity_participants', 'activity_occurrence_participants')
              AND column_name = 'attendance_status'
            """
        )
        self.assertEqual(int(attendance), 2)
        notifications = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM information_schema.columns
            WHERE table_name = 'activity_notifications' AND column_name = 'dedup_key'
            """
        )
        self.assertEqual(int(notifications), 1)
        circle_minimum = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM information_schema.columns
            WHERE table_name = 'circles' AND column_name = 'min_participants'
            """
        )
        self.assertEqual(int(circle_minimum), 0)

    async def test_database_rejects_a_minimum_below_one_or_above_capacity(self) -> None:
        opened = await self._open(groupSize=4, minParticipants=2)
        activity_id = UUID(opened.id)
        for statement in (
            "UPDATE activities SET min_participants = 0 WHERE id = $1",
            "UPDATE activities SET min_participants = group_size + 1 WHERE id = $1",
            "UPDATE activities SET min_participants = NULL WHERE id = $1",
        ):
            with self.subTest(statement=statement):
                with self.assertRaises(asyncpg.PostgresError):
                    async with self.conn.transaction():
                        await self.conn.execute(statement, activity_id)
        self.assertEqual(await self.conn.fetchval("SELECT min_participants FROM activities WHERE id = $1", activity_id), 2)

    async def test_counts_cross_the_minimum_without_changing_status(self) -> None:
        others = await self._others(4)
        opened = await self._open(groupSize=8, minParticipants=4)
        self.assertEqual(opened.participation.goingCount, 1)
        self.assertFalse(opened.participation.isReady)
        self.assertEqual(opened.participation.remainingNeeded, 3)
        self.assertEqual(opened.participation.remainingPlaces, 7)
        for person in others[:2]:
            await join_activity(self.conn, user_id=person, activity_id=UUID(opened.id))
        below = await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(below.goingCount, 3)
        self.assertFalse(below.isReady)
        self.assertEqual(below.remainingNeeded, 1)
        self.assertFalse(below.isFull)
        self.assertEqual(below.remainingPlaces, 5)
        ready = await join_activity(self.conn, user_id=others[2], activity_id=UUID(opened.id))
        self.assertTrue(ready.isReady)
        self.assertEqual(ready.remainingNeeded, 0)
        self.assertEqual(await self._status(opened.id), "open")
        above = await join_activity(self.conn, user_id=others[3], activity_id=UUID(opened.id))
        self.assertEqual(above.goingCount, 5)
        self.assertTrue(above.isReady)
        self.assertFalse(above.isFull)
        self.assertEqual(above.remainingPlaces, 3)
        self.assertEqual(await self._status(opened.id), "open")
        left = await leave_activity(self.conn, user_id=others[3], activity_id=UUID(opened.id))
        await leave_activity(self.conn, user_id=others[2], activity_id=UUID(opened.id))
        dropped = await leave_activity(self.conn, user_id=others[1], activity_id=UUID(opened.id))
        self.assertEqual(left.goingCount, 4)
        self.assertTrue(left.isReady)
        self.assertEqual(dropped.goingCount, 2)
        self.assertFalse(dropped.isReady)
        self.assertEqual(await self._status(opened.id), "open")

    async def test_confirmed_activity_can_fall_below_the_minimum(self) -> None:
        other = (await self._others(1))[0]
        opened = await self._open(groupSize=4, minParticipants=2)
        await join_activity(self.conn, user_id=other, activity_id=UUID(opened.id))
        confirmed = await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(confirmed.status, "confirmed")
        self.assertTrue(confirmed.participation.isReady)
        left = await leave_activity(self.conn, user_id=other, activity_id=UUID(opened.id))
        self.assertFalse(left.isReady)
        self.assertEqual(left.remainingNeeded, 1)
        self.assertEqual(await self._status(opened.id), "confirmed")

    async def test_full_activity_is_ready_and_still_open(self) -> None:
        opened = await self._open(groupSize=1, minParticipants=1)
        self.assertTrue(opened.participation.isReady)
        self.assertTrue(opened.participation.isFull)
        self.assertEqual(opened.participation.remainingPlaces, 0)
        self.assertEqual(opened.status, "open")

    async def test_creator_auto_join_is_pending_idempotent_and_can_be_rejoined(self) -> None:
        members_before = await self.conn.fetchval("SELECT COUNT(*)::int FROM circle_members")
        sessions_before = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance_before = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        opened = await self._open(groupSize=4, minParticipants=4)
        row = await self.conn.fetchrow(
            """
            SELECT status, confirmation_required, attendance_status
            FROM activity_participants WHERE activity_id = $1 AND user_id = $2
            """,
            UUID(opened.id),
            self.member_id,
        )
        self.assertEqual(dict(row), {"status": "going", "confirmation_required": False, "attendance_status": "pending"})
        self.assertEqual(opened.participation.currentUserStatus, "going")
        notices = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_notifications WHERE activity_id = $1",
            UUID(opened.id),
        )
        self.assertEqual(int(notices), 0)
        await self.conn.execute(
            """
            INSERT INTO activity_participants (
              id, activity_id, user_id, status, confirmation_required, attendance_status, joined_at
            )
            VALUES ($1, $2, $3, 'going', FALSE, 'pending', NOW())
            ON CONFLICT (activity_id, user_id) DO UPDATE
            SET status = 'going', confirmation_required = FALSE, updated_at = NOW()
            """,
            uuid4(),
            UUID(opened.id),
            self.member_id,
        )
        count = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_participants WHERE activity_id = $1",
            UUID(opened.id),
        )
        self.assertEqual(int(count), 1)
        left = await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(left.currentUserStatus, "cancelled")
        self.assertEqual(await self.conn.fetchval("SELECT created_by FROM activities WHERE id = $1", UUID(opened.id)), self.member_id)
        again = await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(again.currentUserStatus, "going")
        self.assertEqual(again.goingCount, 1)
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM circle_members"), members_before)
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions"), sessions_before)
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance"), attendance_before)

    async def test_failed_creator_participation_rolls_back_the_activity(self) -> None:
        before = await self.conn.fetchval("SELECT COUNT(*)::int FROM activities")
        await self.conn.execute(
            """
            CREATE FUNCTION fail_creator_participant() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
              RAISE EXCEPTION 'participant insert failed';
            END;
            $$
            """
        )
        await self.conn.execute(
            """
            CREATE TRIGGER fail_creator_participant
            BEFORE INSERT ON activity_participants
            FOR EACH ROW EXECUTE FUNCTION fail_creator_participant()
            """
        )
        with self.assertRaises(asyncpg.PostgresError):
            await create_activity(
                self.conn,
                user_id=self.member_id,
                circle_id=self.circle_id,
                payload=_create_payload(title="Rolled back"),
            )
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM activities"), before)

    async def test_recurring_readiness_and_creator_participation_belong_to_each_date(self) -> None:
        other = (await self._others(1))[0]
        weekly = await self._weekly(groupSize=8, minParticipants=2)
        self.assertEqual(len(weekly.occurrences), ROLLING_DATES)
        self.assertTrue(all(item.participation.goingCount == 1 and not item.participation.isReady for item in weekly.occurrences))
        self.assertTrue(all(item.participation.currentUserStatus == "going" for item in weekly.occurrences))
        first, second, third = weekly.occurrences[0], weekly.occurrences[1], weekly.occurrences[2]
        joined = await join_occurrence(
            self.conn, user_id=other, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        by_id = {item.id: item for item in joined.occurrences}
        self.assertTrue(by_id[first.id].participation.isReady)
        self.assertEqual(by_id[first.id].participation.goingCount, 2)
        self.assertFalse(by_id[second.id].participation.isReady)
        self.assertEqual(by_id[second.id].participation.goingCount, 1)
        self.assertEqual(joined.status, "open")
        await leave_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        left = await self.conn.fetchval(
            """
            SELECT status FROM activity_occurrence_participants
            WHERE occurrence_id = $1 AND user_id = $2
            """,
            UUID(first.id),
            self.member_id,
        )
        self.assertEqual(left, "cancelled")
        for kept in (second.id, third.id):
            status = await self.conn.fetchval(
                "SELECT status FROM activity_occurrence_participants WHERE occurrence_id = $1 AND user_id = $2",
                UUID(kept),
                self.member_id,
            )
            self.assertEqual(status, "going")
        await self._weeks_pass(weekly.id, 1)
        added = await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        self.assertEqual(added, 1)
        self.assertEqual(
            await self.conn.fetchval(
                "SELECT status FROM activity_occurrence_participants WHERE occurrence_id = $1 AND user_id = $2",
                UUID(first.id),
                self.member_id,
            ),
            "cancelled",
        )
        newest = await self.conn.fetchrow(
            """
            SELECT o.id, p.status, p.attendance_status
            FROM activity_occurrences o
            JOIN activity_occurrence_participants p ON p.occurrence_id = o.id AND p.user_id = $2
            WHERE o.activity_id = $1
            ORDER BY o.scheduled_at DESC
            LIMIT 1
            """,
            UUID(weekly.id),
            self.member_id,
        )
        self.assertNotEqual(newest["id"], UUID(first.id))
        self.assertEqual(newest["status"], "going")
        self.assertEqual(newest["attendance_status"], "pending")
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        duplicates = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM (
              SELECT occurrence_id FROM activity_occurrence_participants
              WHERE user_id = $2
                AND occurrence_id IN (SELECT id FROM activity_occurrences WHERE activity_id = $1)
              GROUP BY occurrence_id
              HAVING COUNT(*) > 1
            ) extra
            """,
            UUID(weekly.id),
            self.member_id,
        )
        self.assertEqual(int(duplicates), 0)

    async def test_cancelled_series_does_not_gain_creator_participation(self) -> None:
        weekly = await self._weekly(groupSize=4, minParticipants=2)
        before = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM activity_occurrence_participants p
            JOIN activity_occurrences o ON o.id = p.occurrence_id
            WHERE o.activity_id = $1
            """,
            UUID(weekly.id),
        )
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), reason="Season over")
        self.assertEqual(await ensure_future_activity_occurrences(self.conn, UUID(weekly.id)), 0)
        after = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM activity_occurrence_participants p
            JOIN activity_occurrences o ON o.id = p.occurrence_id
            WHERE o.activity_id = $1
            """,
            UUID(weekly.id),
        )
        self.assertEqual(after, before)

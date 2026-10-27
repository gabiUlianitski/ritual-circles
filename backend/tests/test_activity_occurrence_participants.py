"""Participation on one date of a recurring activity. Rolls back and keeps no rows."""

from __future__ import annotations

import asyncio
import os
import unittest
from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv
from fastapi import HTTPException

from app.schemas import ActivityUpdateRequest
from app.services.activities_service import (
    cancel_activity,
    complete_activity,
    confirm_activity,
    create_activity,
    publish_activity,
    update_activity,
)
from app.services.activity_participants import join_activity, join_occurrence, leave_activity, leave_occurrence
from app.services.circle_members import activate_member
from tests.test_activities import ROOT, _create_payload


class OccurrenceParticipantTests(unittest.IsolatedAsyncioTestCase):
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

    async def _counts(self) -> tuple[int, int]:
        sessions = await self.conn.fetchval('SELECT COUNT(*)::int FROM sessions')
        attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        return int(sessions), int(attendance)

    async def _parent_rows(self, activity_id: str) -> int:
        value = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_participants WHERE activity_id = $1",
            UUID(activity_id),
        )
        return int(value)

    async def _date_rows(self, occurrence_id: str, status: str | None = None) -> int:
        if status is None:
            value = await self.conn.fetchval(
                "SELECT COUNT(*)::int FROM activity_occurrence_participants WHERE occurrence_id = $1",
                UUID(occurrence_id),
            )
        else:
            value = await self.conn.fetchval(
                """
                SELECT COUNT(*)::int
                FROM activity_occurrence_participants
                WHERE occurrence_id = $1 AND status = $2
                """,
                UUID(occurrence_id),
                status,
            )
        return int(value)

    async def _weekly(self, **overrides: object):
        payload = _create_payload(recurrenceType="recurring", recurrenceRule="Mon 18:00", **overrides)
        created = await create_activity(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=payload
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

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

    async def test_join_one_date_does_not_join_the_series_or_legacy_rows(self) -> None:
        before = await self._counts()
        weekly = await self._weekly(title="Saturday tennis", groupSize=4)
        self.assertGreaterEqual(len(weekly.occurrences), 3)
        first = weekly.occurrences[0]
        second = weekly.occurrences[1]
        joined = await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        saved = next(item for item in joined.occurrences if item.id == first.id)
        other = next(item for item in joined.occurrences if item.id == second.id)
        self.assertEqual(saved.participation.currentUserStatus, "going")
        self.assertEqual(saved.participation.goingCount, 1)
        self.assertEqual(other.participation.currentUserStatus, "going")
        self.assertEqual(other.participation.goingCount, 1)
        self.assertEqual(await self._date_rows(first.id, "going"), 1)
        self.assertEqual(await self._date_rows(second.id), 1)
        self.assertEqual(await self._parent_rows(weekly.id), 0)
        self.assertEqual(joined.status, "open")
        self.assertEqual(saved.status, "open")
        self.assertEqual(await self._counts(), before)
        with self.assertRaises(HTTPException):
            await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        with self.assertRaises(HTTPException):
            await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))

    async def test_dates_join_and_leave_independently(self) -> None:
        weekly = await self._weekly(groupSize=4)
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        both = await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id)
        )
        self.assertEqual(await self._date_rows(first.id, "going"), 1)
        self.assertEqual(await self._date_rows(second.id, "going"), 1)
        left = await leave_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        kept = next(item for item in left.occurrences if item.id == second.id)
        dropped = next(item for item in left.occurrences if item.id == first.id)
        self.assertNotEqual(dropped.participation.currentUserStatus, "going")
        self.assertEqual(kept.participation.currentUserStatus, "going")
        self.assertEqual(await self._date_rows(first.id), 1)
        self.assertEqual(await self._date_rows(first.id, "going"), 0)
        self.assertEqual(await self._parent_rows(both.id), 0)

    async def test_creator_fills_each_date_when_group_size_is_one(self) -> None:
        weekly = await self._weekly(groupSize=1)
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        filled = await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        full = next(item for item in filled.occurrences if item.id == first.id)
        self.assertTrue(full.participation.isFull)
        self.assertEqual(full.status, "open")
        self.assertEqual(filled.status, "open")
        spare = next(item for item in filled.occurrences if item.id == second.id)
        self.assertTrue(spare.participation.isFull)
        self.assertEqual(await self._date_rows(first.id, "going"), 1)

    async def test_leaving_a_full_confirmed_date_keeps_it_confirmed(self) -> None:
        weekly = await self._weekly(groupSize=1)
        first = weekly.occurrences[0]
        await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        await confirm_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        left = await leave_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        saved = next(item for item in left.occurrences if item.id == first.id)
        self.assertEqual(saved.status, "confirmed")
        self.assertEqual(saved.participation.goingCount, 0)
        self.assertFalse(saved.participation.isFull)
        self.assertEqual(left.status, "open")

    async def test_cancelled_and_completed_dates_keep_history(self) -> None:
        weekly = await self._weekly(groupSize=4)
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id)
        )
        await cancel_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        with self.assertRaises(HTTPException):
            await join_occurrence(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
            )
        with self.assertRaises(HTTPException):
            await leave_occurrence(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
            )
        self.assertEqual(await self._date_rows(first.id, "going"), 1)
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET status = 'confirmed', start_at = NOW() - INTERVAL '2 hours', end_at = NOW() - INTERVAL '1 hour'
            WHERE id = $1
            """,
            UUID(second.id),
        )
        await complete_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id)
        )
        with self.assertRaises(HTTPException):
            await join_occurrence(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id)
            )
        with self.assertRaises(HTTPException):
            await leave_occurrence(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id)
            )
        self.assertEqual(await self._date_rows(second.id, "going"), 1)

    async def test_ended_date_follows_the_one_time_time_rule(self) -> None:
        weekly = await self._weekly(groupSize=4)
        first = weekly.occurrences[0]
        await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET start_at = NOW() - INTERVAL '2 hours', end_at = NOW() - INTERVAL '1 hour'
            WHERE id = $1
            """,
            UUID(first.id),
        )
        with self.assertRaises(HTTPException) as ended_leave:
            await leave_occurrence(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
            )
        self.assertEqual(ended_leave.exception.status_code, 400)
        self.assertEqual(await self._date_rows(first.id, "going"), 1)
        with self.assertRaises(HTTPException) as ended:
            await join_occurrence(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
            )
        self.assertEqual(ended.exception.status_code, 400)

    async def test_only_an_active_member_can_join_a_date(self) -> None:
        weekly = await self._weekly(groupSize=4)
        first = weekly.occurrences[0]
        outsider = await self.conn.fetchval(
            """
            SELECT u.id
            FROM users u
            WHERE u.id <> $2
              AND NOT EXISTS (
                SELECT 1 FROM circle_members m
                WHERE m.circle_id = $1 AND m.user_id = u.id AND m.status = 'active'
              )
            LIMIT 1
            """,
            self.circle_id,
            self.owner_id,
        )
        if outsider is None:
            self.skipTest("needs a user outside the circle")
        session_id = uuid4()
        await self.conn.execute(
            """
            INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
            VALUES ($1, $2, NOW() + INTERVAL '3 days', 'Court')
            """,
            session_id,
            self.circle_id,
        )
        await self.conn.execute(
            """
            INSERT INTO attendance ("userId", "sessionId", status)
            VALUES ($1, $2, 'attending')
            """,
            outsider,
            session_id,
        )
        with self.assertRaises(HTTPException) as denied:
            await join_occurrence(
                self.conn, user_id=outsider, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
            )
        self.assertEqual(denied.exception.status_code, 403)
        joined = await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        self.assertEqual(joined.occurrences[0].participation.currentUserStatus, "going")

    async def test_repeating_join_keeps_one_row(self) -> None:
        weekly = await self._weekly(groupSize=4)
        first = weekly.occurrences[0]
        await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        again = await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        saved = next(item for item in again.occurrences if item.id == first.id)
        self.assertEqual(saved.participation.goingCount, 1)
        self.assertEqual(await self._date_rows(first.id), 1)

    async def test_one_time_participation_still_uses_the_activity_row(self) -> None:
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="One evening", groupSize=4),
        )
        opened = await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        joined = await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(joined.currentUserStatus, "going")
        self.assertEqual(joined.goingCount, 1)
        self.assertEqual(await self._parent_rows(opened.id), 1)
        dates = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_occurrences WHERE activity_id = $1",
            UUID(opened.id),
        )
        self.assertEqual(int(dates), 0)
        with self.assertRaises(HTTPException):
            await join_occurrence(
                self.conn, user_id=self.member_id, activity_id=UUID(opened.id), occurrence_id=uuid4()
            )

    async def test_group_size_cannot_drop_below_a_date(self) -> None:
        weekly = await self._weekly(groupSize=2)
        first = weekly.occurrences[0]
        other = await self._other()
        await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        await join_occurrence(
            self.conn, user_id=other, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        with self.assertRaises(HTTPException):
            await update_activity(
                self.conn,
                user_id=self.member_id,
                activity_id=UUID(weekly.id),
                payload=ActivityUpdateRequest(groupSize=1),
            )

    async def test_wrong_activity_cannot_join_another_plans_date(self) -> None:
        first = await self._weekly(title="Saturday tennis")
        second = await self._weekly(title="Sunday tennis")
        with self.assertRaises(HTTPException) as rejected:
            await join_occurrence(
                self.conn,
                user_id=self.member_id,
                activity_id=UUID(second.id),
                occurrence_id=UUID(first.occurrences[0].id),
            )
        self.assertEqual(rejected.exception.status_code, 404)
        self.assertEqual(await self._date_rows(first.occurrences[0].id), 1)

    async def test_publishing_adds_creator_to_every_live_date(self) -> None:
        weekly = await self._weekly(groupSize=4)
        for occurrence in weekly.occurrences:
            self.assertEqual(occurrence.participation.goingCount, 1)
            self.assertEqual(occurrence.participation.currentUserStatus, "going")
        first = weekly.occurrences[0]
        confirmed = await confirm_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        saved = next(item for item in confirmed.occurrences if item.id == first.id)
        self.assertEqual(saved.status, "confirmed")
        self.assertEqual(saved.participation.goingCount, 1)
        self.assertEqual(saved.participation.currentUserStatus, "going")
        self.assertEqual(await self._parent_rows(weekly.id), 0)

    async def test_published_dates_are_not_moved(self) -> None:
        weekly = await self._weekly(groupSize=4)
        first = weekly.occurrences[0]
        await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        before = await self.conn.fetchval(
            "SELECT start_at FROM activity_occurrences WHERE id = $1",
            UUID(first.id),
        )
        with self.assertRaises(HTTPException) as moved:
            await update_activity(
                self.conn,
                user_id=self.member_id,
                activity_id=UUID(weekly.id),
                payload=ActivityUpdateRequest(
                    startAt=datetime(2027, 1, 3, 11, 0, tzinfo=timezone.utc),
                    recurrenceRule="Sun 11:00",
                ),
            )
        self.assertEqual(moved.exception.status_code, 400)
        after = await self.conn.fetchval(
            "SELECT start_at FROM activity_occurrences WHERE id = $1",
            UUID(first.id),
        )
        self.assertEqual(after, before)
        self.assertEqual(await self._date_rows(first.id, "going"), 1)

    async def test_two_people_cannot_both_take_the_last_place(self) -> None:
        user_a = self.member_id
        url = os.environ["DATABASE_URL"]
        outside = await asyncpg.connect(url)
        activity_id: UUID | None = None
        user_b: UUID | None = None
        prior_status: str | None = None
        try:
            user_b = await outside.fetchval("SELECT id FROM users WHERE id <> $1 LIMIT 1", user_a)
            if user_b is None:
                self.skipTest("needs another user")
            prior_status = await outside.fetchval(
                """
                SELECT status FROM circle_members
                WHERE circle_id = $1 AND user_id = $2
                """,
                self.circle_id,
                user_b,
            )
            await activate_member(outside, user_id=user_b, circle_id=self.circle_id)
            created = await create_activity(
                outside,
                user_id=user_a,
                circle_id=self.circle_id,
                payload=_create_payload(
                    title="Last place",
                    groupSize=1,
                    recurrenceType="recurring",
                    recurrenceRule="Mon 18:00",
                ),
            )
            activity_id = UUID(created.id)
            published = await publish_activity(outside, user_id=user_a, activity_id=activity_id)
            occurrence_id = UUID(published.occurrences[0].id)

            async def attempt(user_id: UUID) -> int | None:
                conn = await asyncpg.connect(url)
                try:
                    await join_occurrence(
                        conn, user_id=user_id, activity_id=activity_id, occurrence_id=occurrence_id
                    )
                    return None
                except HTTPException as exc:
                    return exc.status_code
                finally:
                    await conn.close()

            codes = await asyncio.gather(attempt(user_a), attempt(user_b))
            self.assertCountEqual(codes, [None, 409])
            going = await outside.fetchval(
                """
                SELECT COUNT(*)::int
                FROM activity_occurrence_participants
                WHERE occurrence_id = $1 AND status = 'going'
                """,
                occurrence_id,
            )
            self.assertEqual(int(going), 1)
        finally:
            if activity_id is not None:
                await outside.execute("DELETE FROM activities WHERE id = $1", activity_id)
            if user_b is not None:
                if prior_status is None:
                    await outside.execute(
                        "DELETE FROM circle_members WHERE circle_id = $1 AND user_id = $2",
                        self.circle_id,
                        user_b,
                    )
                elif prior_status != "active":
                    await outside.execute(
                        """
                        UPDATE circle_members
                        SET status = $3, updated_at = NOW()
                        WHERE circle_id = $1 AND user_id = $2
                        """,
                        self.circle_id,
                        user_b,
                        prior_status,
                    )
            await outside.close()

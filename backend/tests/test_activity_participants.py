"""Activity participation. Database checks roll back and do not keep rows."""

from __future__ import annotations

import os
import unittest
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
from app.services.activity_participants import going_count, join_activity, leave_activity
from app.services.circle_members import activate_member
from tests.test_activities import ROOT, _create_payload


class ActivityParticipantTests(unittest.IsolatedAsyncioTestCase):
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
        sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        return int(sessions), int(attendance)

    async def _rows(self, activity_id: str) -> int:
        value = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_participants WHERE activity_id = $1",
            UUID(activity_id),
        )
        return int(value)

    async def _open(self, **overrides: object):
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(**overrides),
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _others(self, limit: int) -> list[UUID]:
        rows = await self.conn.fetch(
            """
            SELECT id FROM users
            WHERE id <> $1 AND id <> $2
            LIMIT $3
            """,
            self.member_id,
            self.owner_id,
            limit,
        )
        return [row["id"] for row in rows]

    async def test_join_open_activity_does_not_touch_legacy_rows(self) -> None:
        before = await self._counts()
        opened = await self._open(title="Saturday tennis", groupSize=6)
        self.assertEqual(opened.participation.goingCount, 0)
        joined = await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(joined.currentUserStatus, "going")
        self.assertEqual(joined.goingCount, 1)
        self.assertEqual(joined.remainingPlaces, 5)
        self.assertFalse(joined.isFull)
        self.assertEqual(await self._rows(opened.id), 1)
        self.assertEqual(await self._counts(), before)

    async def test_attendance_without_membership_cannot_join(self) -> None:
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
        opened = await self._open()
        before = await self._counts()
        with self.assertRaises(HTTPException) as raised:
            await join_activity(self.conn, user_id=outsider, activity_id=UUID(opened.id))
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(await going_count(self.conn, UUID(opened.id)), 0)
        self.assertEqual(await self._counts(), before)

    async def test_second_join_does_not_take_another_place(self) -> None:
        opened = await self._open(groupSize=4)
        first = await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        second = await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(first.goingCount, 1)
        self.assertEqual(second.goingCount, 1)
        self.assertEqual(await self._rows(opened.id), 1)

    async def test_leave_then_join_reuses_the_same_row(self) -> None:
        opened = await self._open(groupSize=4)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        left = await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(left.currentUserStatus, "cancelled")
        self.assertEqual(left.goingCount, 0)
        again = await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(again.currentUserStatus, "going")
        self.assertEqual(again.goingCount, 1)
        self.assertEqual(await self._rows(opened.id), 1)
        membership = await self.conn.fetchval(
            """
            SELECT status FROM circle_members
            WHERE circle_id = $1 AND user_id = $2
            """,
            self.circle_id,
            self.member_id,
        )
        self.assertEqual(membership, "active")

    async def test_leave_frees_a_place_and_leaves_legacy_rows(self) -> None:
        before = await self._counts()
        opened = await self._open(groupSize=4)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        left = await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(left.goingCount, 0)
        self.assertEqual(left.remainingPlaces, 4)
        again = await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(again.goingCount, 0)
        self.assertEqual(await self._counts(), before)

    async def test_capacity_rejects_the_next_person(self) -> None:
        others = await self._others(2)
        if len(others) < 2:
            self.skipTest("needs two more users")
        for user_id in others:
            await activate_member(self.conn, user_id=user_id, circle_id=self.circle_id)
        opened = await self._open(groupSize=2)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        await join_activity(self.conn, user_id=others[0], activity_id=UUID(opened.id))
        with self.assertRaises(HTTPException) as raised:
            await join_activity(self.conn, user_id=others[1], activity_id=UUID(opened.id))
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(await going_count(self.conn, UUID(opened.id)), 2)
        still = await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(still.currentUserStatus, "cancelled")
        self.assertEqual(still.goingCount, 1)

    async def test_draft_cancelled_completed_and_recurring_cannot_be_joined(self) -> None:
        draft = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Draft hit"),
        )
        with self.assertRaises(HTTPException) as draft_join:
            await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(draft.id))
        self.assertEqual(draft_join.exception.status_code, 400)

        opened = await self._open(title="Open hit")
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        with self.assertRaises(HTTPException) as cancelled_join:
            await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(cancelled_join.exception.status_code, 400)

        done = await self._open(title="Finished hit")
        await self.conn.execute("UPDATE activities SET status = 'completed' WHERE id = $1", UUID(done.id))
        with self.assertRaises(HTTPException) as completed_join:
            await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(done.id))
        self.assertEqual(completed_join.exception.status_code, 400)

        weekly = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Weekly hit", recurrenceType="recurring", recurrenceRule="Mon 18:00"),
        )
        published = await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        with self.assertRaises(HTTPException) as weekly_join:
            await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(published.id))
        self.assertEqual(weekly_join.exception.status_code, 400)
        self.assertEqual(await going_count(self.conn, UUID(published.id)), 0)

    async def test_another_member_cannot_clear_someone_else(self) -> None:
        other = (await self._others(1) or [None])[0]
        if other is None:
            self.skipTest("needs another user")
        await activate_member(self.conn, user_id=other, circle_id=self.circle_id)
        opened = await self._open(groupSize=4)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        left = await leave_activity(self.conn, user_id=other, activity_id=UUID(opened.id))
        self.assertEqual(left.goingCount, 1)
        self.assertIsNone(left.currentUserStatus)
        mine = await self.conn.fetchval(
            """
            SELECT status FROM activity_participants
            WHERE activity_id = $1 AND user_id = $2
            """,
            UUID(opened.id),
            self.member_id,
        )
        self.assertEqual(mine, "going")

    async def test_group_size_cannot_drop_below_people_going(self) -> None:
        others = await self._others(4)
        people = [self.member_id, *others]
        if len(people) < 2:
            self.skipTest("needs two users")
        going_n = min(5, len(people))
        for user_id in people[1:going_n]:
            await activate_member(self.conn, user_id=user_id, circle_id=self.circle_id)
        opened = await self._open(groupSize=going_n)
        for user_id in people[:going_n]:
            await join_activity(self.conn, user_id=user_id, activity_id=UUID(opened.id))
        with self.assertRaises(HTTPException) as too_small:
            await update_activity(
                self.conn,
                user_id=self.member_id,
                activity_id=UUID(opened.id),
                payload=ActivityUpdateRequest(groupSize=going_n - 1),
            )
        self.assertEqual(too_small.exception.status_code, 400)
        kept = await update_activity(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(opened.id),
            payload=ActivityUpdateRequest(groupSize=going_n),
        )
        self.assertEqual(kept.groupSize, going_n)
        self.assertEqual(kept.participation.goingCount, going_n)

    async def test_publishing_does_not_add_the_creator(self) -> None:
        opened = await self._open(title="Creator stays out")
        self.assertEqual(await self._rows(opened.id), 0)
        self.assertEqual(opened.participation.currentUserStatus, None)
        self.assertEqual(opened.participation.goingCount, 0)

    async def test_draft_is_hidden_until_published(self) -> None:
        other = (await self._others(1) or [None])[0]
        if other is None:
            self.skipTest("needs another user")
        await activate_member(self.conn, user_id=other, circle_id=self.circle_id)
        draft = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Hidden draft"),
        )
        self.assertEqual(draft.status, "draft")
        with self.assertRaises(HTTPException) as hidden:
            await join_activity(self.conn, user_id=other, activity_id=UUID(draft.id))
        self.assertEqual(hidden.exception.status_code, 404)
        opened = await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(draft.id))
        self.assertEqual(opened.status, "open")
        joined = await join_activity(self.conn, user_id=other, activity_id=UUID(opened.id))
        self.assertEqual(joined.currentUserStatus, "going")

    async def test_confirm_keeps_people_and_capacity(self) -> None:
        opened = await self._open(groupSize=4)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        confirmed = await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertEqual(confirmed.status, "confirmed")
        self.assertEqual(confirmed.participation.goingCount, 1)
        self.assertFalse(confirmed.participation.isFull)
        self.assertEqual(await self._rows(opened.id), 1)

    async def test_full_open_plan_is_not_confirmed(self) -> None:
        opened = await self._open(groupSize=1)
        joined = await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertTrue(joined.isFull)
        current = await self.conn.fetchval("SELECT status FROM activities WHERE id = $1", UUID(opened.id))
        self.assertEqual(current, "open")

    async def test_confirmed_plan_stays_confirmed_when_someone_leaves(self) -> None:
        other = (await self._others(1) or [None])[0]
        if other is None:
            self.skipTest("needs another user")
        await activate_member(self.conn, user_id=other, circle_id=self.circle_id)
        opened = await self._open(groupSize=2)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        await join_activity(self.conn, user_id=other, activity_id=UUID(opened.id))
        confirmed = await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        self.assertTrue(confirmed.participation.isFull)
        left = await leave_activity(self.conn, user_id=other, activity_id=UUID(opened.id))
        self.assertEqual(left.goingCount, 1)
        self.assertFalse(left.isFull)
        status = await self.conn.fetchval("SELECT status FROM activities WHERE id = $1", UUID(opened.id))
        self.assertEqual(status, "confirmed")
        rejoined = await join_activity(self.conn, user_id=other, activity_id=UUID(opened.id))
        self.assertEqual(rejoined.currentUserStatus, "going")

    async def test_invalid_transitions_and_completion_window(self) -> None:
        draft = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Still draft"),
        )
        with self.assertRaises(HTTPException) as too_soon:
            await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(draft.id))
        self.assertEqual(too_soon.exception.status_code, 400)
        self.assertEqual(
            await self.conn.fetchval("SELECT status FROM activities WHERE id = $1", UUID(draft.id)),
            "draft",
        )
        opened = await self._open(title="Not done yet")
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        with self.assertRaises(HTTPException):
            await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        confirmed = await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        with self.assertRaises(HTTPException) as early:
            await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(confirmed.id))
        self.assertEqual(early.exception.status_code, 400)
        await self.conn.execute(
            """
            UPDATE activities
            SET start_at = NOW() - INTERVAL '2 hours', end_at = NOW() - INTERVAL '1 hour'
            WHERE id = $1
            """,
            UUID(confirmed.id),
        )
        done = await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(confirmed.id))
        self.assertEqual(done.status, "completed")
        self.assertEqual(done.participation.goingCount, 1)
        with self.assertRaises(HTTPException):
            await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(done.id))
        with self.assertRaises(HTTPException):
            await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(done.id))
        with self.assertRaises(HTTPException):
            await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(done.id))
        with self.assertRaises(HTTPException):
            await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(done.id))

    async def test_cancel_preserves_people_and_is_terminal(self) -> None:
        opened = await self._open(groupSize=4)
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        confirmed = await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(opened.id))
        cancelled = await cancel_activity(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(confirmed.id),
            reason="Courts are closed",
        )
        self.assertEqual(cancelled.status, "cancelled")
        self.assertEqual(cancelled.cancellationReason, "Courts are closed")
        self.assertEqual(cancelled.participation.goingCount, 1)
        with self.assertRaises(HTTPException):
            await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(cancelled.id))
        with self.assertRaises(HTTPException):
            await leave_activity(self.conn, user_id=self.member_id, activity_id=UUID(cancelled.id))
        with self.assertRaises(HTTPException):
            await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(cancelled.id))
        with self.assertRaises(HTTPException):
            await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(cancelled.id))

    async def test_member_cannot_change_lifecycle(self) -> None:
        other = (await self._others(1) or [None])[0]
        if other is None:
            self.skipTest("needs another user")
        await activate_member(self.conn, user_id=other, circle_id=self.circle_id)
        opened = await self._open()
        for action in (
            lambda: confirm_activity(self.conn, user_id=other, activity_id=UUID(opened.id)),
            lambda: cancel_activity(self.conn, user_id=other, activity_id=UUID(opened.id)),
            lambda: complete_activity(self.conn, user_id=other, activity_id=UUID(opened.id)),
        ):
            with self.assertRaises(HTTPException) as raised:
                await action()
            self.assertEqual(raised.exception.status_code, 403)

    async def test_recurring_dates_change_on_their_own(self) -> None:
        weekly = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Weekly", recurrenceType="recurring", recurrenceRule="Mon 18:00"),
        )
        published = await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertGreaterEqual(len(published.occurrences), 3)
        first, second, third = published.occurrences[:3]
        await confirm_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(published.id), occurrence_id=UUID(second.id)
        )
        await cancel_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(published.id), occurrence_id=UUID(third.id)
        )
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET status = 'confirmed', start_at = NOW() - INTERVAL '2 hours', end_at = NOW() - INTERVAL '1 hour'
            WHERE id = $1
            """,
            UUID(first.id),
        )
        await complete_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(published.id), occurrence_id=UUID(first.id)
        )
        rows = await self.conn.fetch(
            """
            SELECT id, status FROM activity_occurrences
            WHERE activity_id = $1
            ORDER BY start_at ASC, id ASC
            """,
            UUID(published.id),
        )
        by_id = {str(row["id"]): row["status"] for row in rows}
        self.assertEqual(by_id[first.id], "completed")
        self.assertEqual(by_id[second.id], "confirmed")
        self.assertEqual(by_id[third.id], "cancelled")
        parent = await self.conn.fetchval("SELECT status FROM activities WHERE id = $1", UUID(published.id))
        self.assertEqual(parent, "open")

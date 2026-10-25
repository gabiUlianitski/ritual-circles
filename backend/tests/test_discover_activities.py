"""Discover reads the next meetup from Activities only. Rolls back and keeps no rows."""

from __future__ import annotations

import os
import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv

from app.deps import CurrentUser
from app.routers.circles import list_circles
from app.routers.community import community_preview
from app.schemas import CircleListItemResponse, CommunityCirclePreview
from app.services.circle_next_activity import next_gatherings_for_circles
from app.services.activities_service import (
    cancel_activity,
    create_activity,
    list_activities_for_circle,
    publish_activity,
)
from app.services.activity_participants import join_occurrence
from app.services.circle_invitations import create_invitation, get_invitation_preview
from tests.test_activities import ROOT, _create_payload


@dataclass(frozen=True)
class _Picked:
    activityId: str
    occurrenceId: str | None
    title: str
    startAt: datetime
    locationName: str | None
    locationAddress: str | None
    isRecurring: bool


def _next_monday_evening() -> datetime:
    now = datetime.now(timezone.utc)
    days = (7 - now.weekday()) % 7 or 7
    return (now + timedelta(days=days)).replace(hour=18, minute=0, second=0, microsecond=0)


class DiscoverActivitiesTests(unittest.IsolatedAsyncioTestCase):
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
        self.monday = _next_monday_evening()
        await self.conn.execute("DELETE FROM activities WHERE circle_id = $1", self.circle_id)

    async def asyncTearDown(self) -> None:
        tx = getattr(self, "tx", None)
        conn = getattr(self, "conn", None)
        if tx is not None:
            await tx.rollback()
        if conn is not None:
            await conn.close()

    async def _drop_sessions(self) -> None:
        await self.conn.execute(
            'DELETE FROM attendance WHERE "sessionId" IN (SELECT id FROM sessions WHERE "circleId" = $1)',
            self.circle_id,
        )
        await self.conn.execute('DELETE FROM sessions WHERE "circleId" = $1', self.circle_id)

    async def _plan(self, **overrides: object):
        created = await create_activity(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=_create_payload(**overrides)
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _one_time(self, title: str, days_after_monday: float, **overrides: object):
        return await self._plan(title=title, startAt=self.monday + timedelta(days=days_after_monday), **overrides)

    async def _weekly(self, title: str = "Weekly tennis", **overrides: object):
        return await self._plan(
            title=title, startAt=self.monday, recurrenceType="recurring", recurrenceRule="Mon 18:00", **overrides
        )

    async def _listed(self) -> CircleListItemResponse | None:
        rows = await list_circles(conn=self.conn, user=self.user, lang="en")
        return next((row for row in rows if row.id == str(self.circle_id)), None)

    async def _next(self) -> _Picked | None:
        """The internal pick, after checking the public catalog shows the same time."""
        listed = await self._listed()
        self.assertIsNotNone(listed)
        picked = (await next_gatherings_for_circles(self.conn, [self.circle_id])).get(self.circle_id)
        if picked is None:
            self.assertIsNone(listed.nextActivity)
            return None
        self.assertEqual(listed.nextActivity.startAt, picked.start_at)
        return _Picked(
            activityId=str(picked.activity_id),
            occurrenceId=None if picked.occurrence_id is None else str(picked.occurrence_id),
            title=picked.title,
            startAt=picked.start_at,
            locationName=picked.location_name,
            locationAddress=picked.location_address,
            isRecurring=picked.is_recurring,
        )

    async def test_a_circle_without_session_or_activity_is_listed(self) -> None:
        await self._drop_sessions()
        listed = await self._listed()
        self.assertIsNotNone(listed)
        self.assertIsNone(listed.nextActivity)
        self.assertNotIn("nextSessionAt", CircleListItemResponse.model_fields)

    async def test_b_activity_without_session(self) -> None:
        await self._drop_sessions()
        plan = await self._one_time("Coffee", 1)
        nxt = await self._next()
        self.assertIsNotNone(nxt)
        self.assertEqual(nxt.activityId, plan.id)
        self.assertIsNone(nxt.occurrenceId)
        self.assertFalse(nxt.isRecurring)

    async def test_c_session_does_not_decide_next_activity(self) -> None:
        await self.conn.execute(
            """
            INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
            VALUES ($1, $2, NOW() + INTERVAL '1 hour', 'Legacy place')
            """,
            uuid4(),
            self.circle_id,
        )
        plan = await self._one_time("Real plan", 1)
        nxt = await self._next()
        self.assertEqual(nxt.activityId, plan.id)
        self.assertEqual(nxt.startAt, self.monday + timedelta(days=1))
        self.assertNotEqual(nxt.locationName, "Legacy place")

    async def test_d_earliest_one_time_wins(self) -> None:
        await self._one_time("Later", 5)
        earliest = await self._one_time("Earliest", 1)
        await self._one_time("Middle", 3)
        nxt = await self._next()
        self.assertEqual(nxt.activityId, earliest.id)
        self.assertEqual(nxt.title, "Earliest")

    async def test_e_recurring_date_earlier_than_one_time(self) -> None:
        await self._one_time("Coffee", 3)
        weekly = await self._weekly()
        await self._one_time("Hike", 5)
        nxt = await self._next()
        self.assertEqual(nxt.activityId, weekly.id)
        self.assertTrue(nxt.isRecurring)
        self.assertIsNotNone(nxt.occurrenceId)
        self.assertEqual(nxt.startAt, self.monday)

    async def test_f_cancelled_one_time_is_skipped(self) -> None:
        cancelled = await self._one_time("Called off", 1)
        kept = await self._one_time("Still on", 2)
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(cancelled.id))
        nxt = await self._next()
        self.assertEqual(nxt.activityId, kept.id)

    async def test_g_completed_one_time_is_skipped(self) -> None:
        done = await self._one_time("Done", 1)
        kept = await self._one_time("Still on", 2)
        await self.conn.execute("UPDATE activities SET status = 'completed' WHERE id = $1", UUID(done.id))
        nxt = await self._next()
        self.assertEqual(nxt.activityId, kept.id)

    async def test_h_cancelled_date_is_skipped(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await cancel_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        nxt = await self._next()
        self.assertEqual(nxt.activityId, weekly.id)
        self.assertNotEqual(nxt.occurrenceId, first.id)
        self.assertEqual(nxt.startAt, self.monday + timedelta(days=7))

    async def test_i_cancelled_series_gives_nothing(self) -> None:
        weekly = await self._weekly()
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        await self.conn.execute(
            "DELETE FROM activity_occurrences WHERE activity_id = $1 AND start_at > NOW()", UUID(weekly.id)
        )
        self.assertIsNone(await self._next())
        topped_up = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_occurrences WHERE activity_id = $1 AND start_at > NOW()",
            UUID(weekly.id),
        )
        self.assertEqual(topped_up, 0)

    async def test_j_date_place_override(self) -> None:
        weekly = await self._weekly(locationName="Main courts", locationAddress="Park road 1")
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET location_name_override = 'Court 7', location_address_override = 'Lake road 9'
            WHERE id = $1
            """,
            UUID(weekly.occurrences[0].id),
        )
        nxt = await self._next()
        self.assertEqual(nxt.occurrenceId, weekly.occurrences[0].id)
        self.assertEqual(nxt.locationName, "Court 7")
        self.assertEqual(nxt.locationAddress, "Lake road 9")

    async def test_j_parent_place_without_override(self) -> None:
        await self._weekly(locationName="Main courts", locationAddress="Park road 1")
        nxt = await self._next()
        self.assertEqual(nxt.locationName, "Main courts")
        self.assertEqual(nxt.locationAddress, "Park road 1")

    async def test_k_capacity_is_the_activity_dates(self) -> None:
        weekly = await self._weekly(groupSize=3)
        await join_occurrence(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(weekly.occurrences[0].id),
        )
        listed = await self._listed()
        public = listed.nextActivity.model_dump()
        for field in ("goingCount", "groupSize", "remainingPlaces", "isFull"):
            self.assertNotIn(field, public)
        activities = await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        date = next(item for item in activities if item.id == weekly.id).occurrences[0].participation
        self.assertEqual(date.goingCount, 1)
        self.assertEqual(date.groupSize, 3)
        self.assertEqual(date.remainingPlaces, 2)
        members = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM circle_members WHERE circle_id = $1 AND status = 'active'", self.circle_id
        )
        self.assertEqual(listed.memberCount, members)

    async def test_l_no_upcoming_activity_keeps_circle(self) -> None:
        past = await self._one_time("Last month", 1)
        await self.conn.execute(
            "UPDATE activities SET start_at = NOW() - INTERVAL '30 days', end_at = NULL WHERE id = $1",
            UUID(past.id),
        )
        listed = await self._listed()
        self.assertIsNotNone(listed)
        self.assertIsNone(listed.nextActivity)

    async def test_m_removing_sessions_keeps_circle_listed(self) -> None:
        self.assertIsNotNone(await self._listed())
        await self._drop_sessions()
        self.assertIsNotNone(await self._listed())

    async def test_n_invitation_preview_uses_activity(self) -> None:
        invitee = await self.conn.fetchval(
            """
            SELECT u.id FROM users u
            WHERE NOT EXISTS (
              SELECT 1 FROM circle_members m
              WHERE m.circle_id = $1 AND m.user_id = u.id AND m.status = 'active'
            )
            LIMIT 1
            """,
            self.circle_id,
        )
        if invitee is None:
            self.skipTest("no user outside the circle")
        await self.conn.execute(
            "DELETE FROM circle_invitations WHERE circle_id = $1 AND invitee_user_id = $2", self.circle_id, invitee
        )
        await self._drop_sessions()
        invitation = await create_invitation(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, invitee_id=invitee
        )
        invitation_id = UUID(str(invitation["id"]))
        preview = await get_invitation_preview(self.conn, user_id=invitee, invitation_id=invitation_id, lang="en")
        self.assertIsNone(preview["nextActivity"])
        self.assertNotIn("nextSessionAt", preview)
        plan = await self._one_time("Welcome coffee", 1)
        preview = await get_invitation_preview(self.conn, user_id=invitee, invitation_id=invitation_id, lang="en")
        self.assertEqual(preview["nextActivity"].startAt, self.monday + timedelta(days=1))
        self.assertIsNotNone(plan.id)

    async def test_o_discover_reads_write_no_sessions_or_attendance(self) -> None:
        await self._weekly()
        await self._one_time("Coffee", 2)

        async def counts() -> tuple[int, int]:
            sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
            attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
            return int(sessions), int(attendance)

        before = await counts()
        await list_circles(conn=self.conn, user=self.user, lang="en")
        await list_circles(conn=self.conn, user=None, lang="en")
        await community_preview(conn=self.conn, lang="en")
        self.assertEqual(await counts(), before)

    async def test_s_stale_recurring_window_is_topped_up(self) -> None:
        weekly = await self._weekly()
        await self.conn.execute("DELETE FROM activity_occurrences WHERE activity_id = $1", UUID(weekly.id))
        nxt = await self._next()
        self.assertIsNotNone(nxt)
        self.assertEqual(nxt.activityId, weekly.id)
        self.assertIsNotNone(nxt.occurrenceId)

    async def test_r_recurring_pick_matches_activity_next_occurrence(self) -> None:
        weekly = await self._weekly(locationName="Main courts")
        await cancel_activity(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(weekly.occurrences[0].id),
        )
        await self.conn.execute(
            "UPDATE activity_occurrences SET location_name_override = 'Court 7' WHERE id = $1",
            UUID(weekly.occurrences[1].id),
        )
        listed = await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        service_next = next(item for item in listed if item.id == weekly.id).nextOccurrence
        nxt = await self._next()
        self.assertEqual(nxt.occurrenceId, service_next.id)
        self.assertEqual(nxt.startAt, service_next.startAt)
        self.assertEqual(nxt.locationName, service_next.locationName)

    async def test_q_community_counts_come_from_activities(self) -> None:
        before = await community_preview(conn=self.conn, lang="en")
        await self._drop_sessions()
        await self._plan(title="Soon", startAt=datetime.now(timezone.utc) + timedelta(hours=2))
        after = await community_preview(conn=self.conn, lang="en")
        self.assertEqual(after.stats.meetupsThisWeek, before.stats.meetupsThisWeek + 1)
        self.assertNotIn("nextSessionAt", CommunityCirclePreview.model_fields)


    async def test_p_catalog_query_count_does_not_grow_with_circles(self) -> None:
        others = await self.conn.fetch(
            """
            SELECT DISTINCT ON (c.id) c.id AS circle_id, m.user_id
            FROM circles c
            JOIN circle_members m ON m.circle_id = c.id AND m.status = 'active'
            WHERE c.id <> $1
            ORDER BY c.id, m.user_id
            LIMIT 2
            """,
            self.circle_id,
        )
        if len(others) < 2:
            self.skipTest("needs three circles with members")
        expected: dict[str, tuple[str, datetime]] = {}
        for offset, row in enumerate(others, start=1):
            await self.conn.execute("DELETE FROM activities WHERE circle_id = $1", row["circle_id"])
            start = self.monday + timedelta(days=offset)
            created = await create_activity(
                self.conn,
                user_id=row["user_id"],
                circle_id=row["circle_id"],
                payload=_create_payload(title=f"Circle {offset}", startAt=start),
            )
            await publish_activity(self.conn, user_id=row["user_id"], activity_id=UUID(created.id))
            expected[str(row["circle_id"])] = (created.id, start)
        weekly = await self._weekly()
        expected[str(self.circle_id)] = (weekly.id, self.monday)

        await list_circles(conn=self.conn, user=self.user, lang="en")
        counting = _CountingConnection(self.conn)
        rows = await list_circles(conn=counting, user=self.user, lang="en")
        self.assertLessEqual(counting.queries, 3)
        listed = {row.id: row for row in rows}
        picked = await next_gatherings_for_circles(self.conn, [UUID(cid) for cid in expected])
        for circle_id, (activity_id, start) in expected.items():
            self.assertEqual(str(picked[UUID(circle_id)].activity_id), activity_id)
            self.assertEqual(listed[circle_id].nextActivity.startAt, start)


class _CountingConnection:
    """Counts queries sent through it; everything else goes to the real connection."""

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self.queries = 0

    def __getattr__(self, name: str):
        target = getattr(self._conn, name)
        if name not in ("fetch", "fetchrow", "fetchval", "execute"):
            return target

        async def counted(*args, **kwargs):
            self.queries += 1
            return await target(*args, **kwargs)

        return counted


if __name__ == "__main__":
    unittest.main()

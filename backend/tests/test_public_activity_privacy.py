"""Public circle surfaces show only when the next Activity happens. Rolls back and keeps no rows."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID

import asyncpg
from dotenv import load_dotenv

from app.deps import CurrentUser
from app.routers.circles import list_circles
from app.routers.community import community_preview
from app.schemas import ActivitySuggestionCreate, CircleNextActivity
from app.services.activities_service import (
    cancel_activity,
    create_activity,
    get_activity,
    publish_activity,
)
from app.services.activity_participants import join_activity
from app.services.activity_suggestions import create_suggestion
from app.services.circle_invitations import create_invitation, get_invitation_preview
from tests.test_activities import ROOT, _create_payload

TITLE = "Poker at Gabi flat 7 zq81"
VENUE = "Hidden Venue zq81"
ADDRESS = "Secret Street 99 zq81"
OVERRIDE_VENUE = "Back Room zq82"
OVERRIDE_ADDRESS = "Side Alley 3 zq82"
NOTE = "Bring the blue cards zq83"
MARKERS = (TITLE, VENUE, ADDRESS, OVERRIDE_VENUE, OVERRIDE_ADDRESS, NOTE, "zq8")
PRIVATE_FIELDS = (
    "title",
    "locationName",
    "locationAddress",
    "activityId",
    "occurrenceId",
    "goingCount",
    "groupSize",
    "remainingPlaces",
    "isFull",
    "participation",
    "going",
    "suggestions",
    "status",
)


def _next_monday_evening() -> datetime:
    now = datetime.now(timezone.utc)
    days = (7 - now.weekday()) % 7 or 7
    return (now + timedelta(days=days)).replace(hour=18, minute=0, second=0, microsecond=0)


class PublicActivityPrivacyTests(unittest.IsolatedAsyncioTestCase):
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
        self.outsider_id = await self.conn.fetchval(
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
        self.monday = _next_monday_evening()
        await self.conn.execute("DELETE FROM activities WHERE circle_id = $1", self.circle_id)
        await self.conn.execute(
            "UPDATE circles SET city_name = 'Zurich' WHERE id = $1",
            self.circle_id,
        )

    async def asyncTearDown(self) -> None:
        tx = getattr(self, "tx", None)
        conn = getattr(self, "conn", None)
        if tx is not None:
            await tx.rollback()
        if conn is not None:
            await conn.close()

    async def _publish(self, **overrides: object):
        created = await create_activity(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=_create_payload(**overrides)
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _private_one_time(self):
        plan = await self._publish(
            title=TITLE,
            startAt=self.monday + timedelta(days=1),
            locationName=VENUE,
            locationAddress=ADDRESS,
        )
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await create_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(plan.id),
            payload=ActivitySuggestionCreate(type="location", proposedLocationName=OVERRIDE_VENUE, note=NOTE),
        )
        return plan

    async def _private_weekly(self):
        weekly = await self._publish(
            title=TITLE,
            startAt=self.monday,
            recurrenceType="recurring",
            recurrenceRule="Mon 18:00",
            locationName=VENUE,
            locationAddress=ADDRESS,
        )
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET location_name_override = $2, location_address_override = $3
            WHERE id = $1
            """,
            UUID(weekly.occurrences[0].id),
            OVERRIDE_VENUE,
            OVERRIDE_ADDRESS,
        )
        return weekly

    async def _catalog_row(self, user: CurrentUser | None):
        rows = await list_circles(conn=self.conn, user=user, lang="en")
        row = next((item for item in rows if item.id == str(self.circle_id)), None)
        self.assertIsNotNone(row)
        return row

    def _assert_public(self, text: str) -> None:
        for marker in MARKERS:
            self.assertNotIn(marker, text)

    def _assert_safe_shape(self, nxt: CircleNextActivity | None) -> None:
        self.assertIsNotNone(nxt)
        dumped = nxt.model_dump()
        self.assertEqual(set(dumped), {"startAt", "endAt", "isRecurring"})
        for field in PRIVATE_FIELDS:
            self.assertNotIn(field, dumped)

    async def test_a_guest_catalog_gets_time_only(self) -> None:
        await self._private_one_time()
        rows = await list_circles(conn=self.conn, user=None, lang="en")
        self._assert_public("".join(row.model_dump_json() for row in rows))
        row = next(item for item in rows if item.id == str(self.circle_id))
        self._assert_safe_shape(row.nextActivity)
        self.assertEqual(row.nextActivity.startAt, self.monday + timedelta(days=1))

    async def test_b_signed_in_non_member_gets_the_same(self) -> None:
        if self.outsider_id is None:
            self.skipTest("no user outside the circle")
        await self._private_one_time()
        row = await self._catalog_row(CurrentUser(id=self.outsider_id))
        self.assertFalse(row.isYours)
        self._assert_public(row.model_dump_json())
        self._assert_safe_shape(row.nextActivity)

    async def test_c_member_activity_details_unchanged(self) -> None:
        plan = await self._private_one_time()
        detail = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertEqual(detail.title, TITLE)
        self.assertEqual(detail.locationName, VENUE)
        self.assertEqual(detail.locationAddress, ADDRESS)
        self.assertEqual(detail.participation.goingCount, 1)
        self.assertEqual(len(detail.participation.going), 1)
        self.assertIn(NOTE, [item.note for item in detail.suggestions])
        member_row = await self._catalog_row(CurrentUser(id=self.member_id))
        self._assert_public(member_row.model_dump_json())

    async def test_d_invite_only_circle_is_listed_without_details(self) -> None:
        await self.conn.execute("UPDATE circles SET invite_only = true WHERE id = $1", self.circle_id)
        await self._private_one_time()
        row = await self._catalog_row(None)
        self.assertTrue(row.inviteOnly)
        self._assert_public(row.model_dump_json())
        self._assert_safe_shape(row.nextActivity)

    async def test_e_broad_location_is_the_circle_city(self) -> None:
        await self._private_one_time()
        row = await self._catalog_row(None)
        self.assertEqual(row.cityName, "Zurich")
        self._assert_public(row.model_dump_json())

    async def test_f_no_location_is_invented(self) -> None:
        await self.conn.execute(
            "UPDATE circles SET city_name = NULL, city = NULL, meeting_place = NULL WHERE id = $1",
            self.circle_id,
        )
        await self._private_one_time()
        row = await self._catalog_row(None)
        self.assertIsNone(row.cityName)
        self.assertIsNone(row.city)
        self.assertIsNone(row.meetingPlace)
        self._assert_safe_shape(row.nextActivity)
        self._assert_public(row.model_dump_json())

    async def test_g_date_override_stays_with_members(self) -> None:
        weekly = await self._private_weekly()
        row = await self._catalog_row(None)
        self._assert_public(row.model_dump_json())
        self._assert_safe_shape(row.nextActivity)
        self.assertTrue(row.nextActivity.isRecurring)
        detail = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(detail.nextOccurrence.locationName, OVERRIDE_VENUE)
        self.assertEqual(detail.nextOccurrence.locationAddress, OVERRIDE_ADDRESS)

    async def test_h_invitation_preview_gets_time_only(self) -> None:
        if self.outsider_id is None:
            self.skipTest("no user outside the circle")
        await self.conn.execute(
            "DELETE FROM circle_invitations WHERE circle_id = $1 AND invitee_user_id = $2",
            self.circle_id,
            self.outsider_id,
        )
        await self._private_one_time()
        invitation = await create_invitation(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, invitee_id=self.outsider_id
        )
        preview = await get_invitation_preview(
            self.conn, user_id=self.outsider_id, invitation_id=UUID(str(invitation["id"])), lang="en"
        )
        self._assert_safe_shape(preview["nextActivity"])
        self._assert_public(repr(preview))

    async def test_i_no_capacity_on_public_surfaces(self) -> None:
        await self._private_one_time()
        await self._private_weekly()
        rows = await list_circles(conn=self.conn, user=None, lang="en")
        community = await community_preview(conn=self.conn, lang="en")
        self._assert_public(community.model_dump_json())
        for item in [*rows, *community.featuredCircles]:
            if item.nextActivity is not None:
                self._assert_safe_shape(item.nextActivity)
        self._assert_safe_shape(next(item for item in rows if item.id == str(self.circle_id)).nextActivity)

    async def test_j_selection_still_skips_cancelled_and_picks_earliest(self) -> None:
        later = await self._publish(title="Later", startAt=self.monday + timedelta(days=4))
        cancelled = await self._publish(title="Called off", startAt=self.monday + timedelta(days=1))
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(cancelled.id))
        row = await self._catalog_row(None)
        self.assertEqual(row.nextActivity.startAt, self.monday + timedelta(days=4))
        self.assertIsNotNone(later.id)


if __name__ == "__main__":
    unittest.main()

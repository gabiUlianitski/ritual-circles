"""Circles live without legacy Sessions and Attendance. Rolls back and keeps no rows."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv

from fastapi import HTTPException

from app import schemas
from app.deps import CurrentUser
from app.main import create_app
from app.routers.circles import get_my_circle
from app.schemas import CircleCreateRequest, CirclePatchRequest, MeetingPlacePatch
from app.services.activities_service import (
    create_activity,
    ensure_future_activity_occurrences,
    publish_activity,
)
from app.services.circle_chat_service import create_message
from app.services.circle_invitations import create_invitation, respond_to_invitation
from app.services.circle_suggestions import respond_to_circle_suggestion
from app.services.circles_service import (
    create_circle,
    join_circle,
    join_circle_open,
    list_circles_catalog,
    patch_circle,
)
from app.services.home_query import fetch_home
from tests.test_activities import ROOT, _create_payload

_SESSION_FIELDS = ("nextSession", "nextSessionAt", "myAttendance", "calendarSessions", "pendingConfirmation")


class SessionRetirementTests(unittest.IsolatedAsyncioTestCase):
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
        users = await self.conn.fetch("SELECT id FROM users ORDER BY id LIMIT 2")
        if len(users) < 2:
            self.skipTest("need two users")
        self.creator_id: UUID = users[0]["id"]
        self.joiner_id: UUID = users[1]["id"]
        slug = await self.conn.fetchval("SELECT slug FROM hobies ORDER BY slug LIMIT 1")
        if not slug:
            self.skipTest("no hobies")
        self.slug = str(slug)

    async def asyncTearDown(self) -> None:
        tx = getattr(self, "tx", None)
        conn = getattr(self, "conn", None)
        if tx is not None:
            await tx.rollback()
        if conn is not None:
            await conn.close()

    async def _legacy_counts(self) -> tuple[int, int]:
        sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        return int(sessions), int(attendance)

    async def _create(self, **overrides: object):
        data: dict[str, object] = {
            "ritualType": self.slug,
            "modality": "online",
            "recurringTime": "Mon 18:00",
            "inviteOnly": False,
        }
        data.update(overrides)
        return await create_circle(
            self.conn, user_id=self.creator_id, payload=CircleCreateRequest.model_validate(data)
        )

    async def _activity_count(self, circle_id: str) -> int:
        return int(
            await self.conn.fetchval("SELECT COUNT(*)::int FROM activities WHERE circle_id = $1", UUID(circle_id))
        )

    async def _is_member(self, user_id: UUID, circle_id: str) -> bool:
        return bool(
            await self.conn.fetchval(
                "SELECT 1 FROM circle_members WHERE user_id = $1 AND circle_id = $2 AND status = 'active'",
                user_id,
                UUID(circle_id),
            )
        )

    async def test_a_create_circle_writes_no_session_attendance_or_activity(self) -> None:
        before = await self._legacy_counts()
        for recurring in (True, False):
            circle = await self._create(isRecurring=recurring)
            self.assertTrue(await self._is_member(self.creator_id, circle.id))
            self.assertEqual(await self._activity_count(circle.id), 0)
        self.assertEqual(await self._legacy_counts(), before)

    async def test_b_join_circle_without_any_session(self) -> None:
        circle = await self._create()
        before = await self._legacy_counts()
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=circle.inviteCode)
        self.assertTrue(await self._is_member(self.joiner_id, circle.id))
        self.assertEqual(await self._legacy_counts(), before)

    async def test_creator_cannot_join_own_circle(self) -> None:
        circle = await self._create()
        before = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM circle_members WHERE circle_id = $1 AND status = 'active'",
            UUID(circle.id),
        )
        with self.assertRaises(HTTPException) as by_invite:
            await join_circle(self.conn, user_id=self.creator_id, invite_code=circle.inviteCode)
        self.assertEqual(by_invite.exception.status_code, 403)
        with self.assertRaises(HTTPException) as by_search:
            await join_circle_open(self.conn, user_id=self.creator_id, circle_id=UUID(circle.id))
        self.assertEqual(by_search.exception.status_code, 403)
        after = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM circle_members WHERE circle_id = $1 AND status = 'active'",
            UUID(circle.id),
        )
        self.assertEqual(after, before)
        listed = await list_circles_catalog(self.conn, user_id=self.creator_id)
        own = next(item for item in listed if item["id"] == circle.id)
        self.assertTrue(own["isCreator"])
        self.assertTrue(own["isYours"])

    async def test_b_open_join_without_any_session(self) -> None:
        circle = await self._create()
        before = await self._legacy_counts()
        await join_circle_open(self.conn, user_id=self.joiner_id, circle_id=UUID(circle.id))
        self.assertTrue(await self._is_member(self.joiner_id, circle.id))
        self.assertEqual(await self._legacy_counts(), before)

    async def test_c_join_circle_with_only_past_sessions(self) -> None:
        circle = await self._create()
        await self.conn.execute(
            'INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink") VALUES ($1, $2, $3, $4)',
            uuid4(),
            UUID(circle.id),
            datetime.now(tz=timezone.utc) - timedelta(days=14),
            "Past meetup",
        )
        before = await self._legacy_counts()
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=circle.inviteCode)
        self.assertTrue(await self._is_member(self.joiner_id, circle.id))
        self.assertEqual(await self._legacy_counts(), before)

    async def test_join_does_not_join_any_activity(self) -> None:
        circle = await self._create()
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=circle.inviteCode)
        joined_activities = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM activity_participants p
            JOIN activities a ON a.id = p.activity_id
            WHERE a.circle_id = $1 AND p.user_id = $2
            """,
            UUID(circle.id),
            self.joiner_id,
        )
        self.assertEqual(int(joined_activities), 0)

    async def test_g_home_lists_circle_with_zero_sessions_and_activities(self) -> None:
        circle = await self._create()
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=circle.inviteCode)
        for user_id, creator in ((self.creator_id, True), (self.joiner_id, False)):
            home = await fetch_home(self.conn, user_id)
            items = {item.circle.id: item for item in home.myCircles}
            self.assertIn(circle.id, items)
            self.assertEqual(items[circle.id].isCreator, creator)
            self.assertIsNotNone(home.circle)

    async def _with_legacy_future_session(self) -> tuple[str, UUID]:
        circle = await self._create()
        session_id = uuid4()
        await self.conn.execute(
            'INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink") VALUES ($1, $2, $3, $4)',
            session_id,
            UUID(circle.id),
            datetime.now(tz=timezone.utc) + timedelta(days=3),
            "Old park",
        )
        await self.conn.execute(
            'INSERT INTO attendance ("userId", "sessionId", status) VALUES ($1, $2, $3)',
            self.creator_id,
            session_id,
            "attending",
        )
        return circle.id, session_id

    async def _legacy_session(self, session_id: UUID) -> tuple[object, str]:
        row = await self.conn.fetchrow('SELECT "dateTime", "locationOrLink" FROM sessions WHERE id = $1', session_id)
        return row["dateTime"], row["locationOrLink"]

    def test_j_patch_request_has_no_schedule_fields(self) -> None:
        for field in ("firstSessionAt", "recurringTime", "isRecurring"):
            self.assertNotIn(field, CirclePatchRequest.model_fields)

    async def test_j_circle_edit_keeps_sessions_and_attendance(self) -> None:
        circle_id, session_id = await self._with_legacy_future_session()
        before = await self._legacy_counts()
        before_session = await self._legacy_session(session_id)
        updated = await patch_circle(
            self.conn,
            user_id=self.creator_id,
            circle_id=UUID(circle_id),
            invite_only=True,
            meeting_place_update=MeetingPlacePatch(name="New hall", city="Haifa", address="1 Main St"),
            description="Weekly friends",
            update_description=True,
            name="Hall friends",
            update_name=True,
        )
        self.assertEqual(updated.meetingPlace, "New hall — 1 Main St")
        self.assertEqual(updated.cityName, "Haifa")
        self.assertTrue(updated.inviteOnly)
        self.assertEqual(await self._legacy_counts(), before)
        self.assertEqual(await self._legacy_session(session_id), before_session)

    async def _suggestion(self, circle_id: str, body: str) -> UUID:
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=await self.conn.fetchval(
            'SELECT "inviteCode" FROM circles WHERE id = $1', UUID(circle_id)
        ))
        message_id = uuid4()
        await self.conn.execute(
            "INSERT INTO circle_messages (id, circle_id, user_id, body) VALUES ($1, $2, $3, $4)",
            message_id,
            UUID(circle_id),
            self.joiner_id,
            body,
        )
        return message_id

    async def test_place_suggestion_updates_circle_not_sessions(self) -> None:
        circle_id, session_id = await self._with_legacy_future_session()
        message_id = await self._suggestion(circle_id, '[PLACE_SUGGEST]{"name": "Cafe", "city": "Haifa"}')
        before = await self._legacy_counts()
        before_session = await self._legacy_session(session_id)
        updated = await respond_to_circle_suggestion(
            self.conn, user_id=self.creator_id, circle_id=UUID(circle_id), message_id=message_id, accept=True
        )
        self.assertEqual(updated.meetingPlace, "Cafe")
        self.assertEqual(await self._legacy_counts(), before)
        self.assertEqual(await self._legacy_session(session_id), before_session)

    async def test_time_suggestion_no_longer_reschedules_sessions(self) -> None:
        circle_id, session_id = await self._with_legacy_future_session()
        message_id = await self._suggestion(circle_id, "[TIME_SUGGEST]2026-12-01T18:00:00Z")
        before = await self._legacy_counts()
        before_session = await self._legacy_session(session_id)
        with self.assertRaises(HTTPException) as caught:
            await respond_to_circle_suggestion(
                self.conn, user_id=self.creator_id, circle_id=UUID(circle_id), message_id=message_id, accept=True
            )
        self.assertEqual(caught.exception.status_code, 400)
        await respond_to_circle_suggestion(
            self.conn, user_id=self.creator_id, circle_id=UUID(circle_id), message_id=message_id, accept=False
        )
        self.assertEqual(await self._legacy_counts(), before)
        self.assertEqual(await self._legacy_session(session_id), before_session)

    async def test_n_chat_rejects_new_time_suggestions_and_keeps_messages(self) -> None:
        circle = await self._create()
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=circle.inviteCode)
        before = await self._legacy_counts()
        with self.assertRaises(HTTPException) as caught:
            await create_message(self.conn, UUID(circle.id), self.joiner_id, "[TIME_SUGGEST]2026-12-01T18:00:00Z")
        self.assertEqual(caught.exception.status_code, 400)
        sent = await create_message(self.conn, UUID(circle.id), self.joiner_id, "Hello everyone")
        self.assertEqual(sent["body"], "Hello everyone")
        self.assertEqual(await self._legacy_counts(), before)

    async def test_home_member_count_comes_from_active_members(self) -> None:
        circle = await self._create()
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=circle.inviteCode)
        home = await fetch_home(self.conn, self.creator_id)
        item = next(i for i in home.myCircles if i.circle.id == circle.id)
        self.assertEqual(item.memberCount, 2)
        await self.conn.execute(
            "UPDATE circle_members SET status = 'left' WHERE user_id = $1 AND circle_id = $2",
            self.joiner_id,
            UUID(circle.id),
        )
        home = await fetch_home(self.conn, self.creator_id)
        item = next(i for i in home.myCircles if i.circle.id == circle.id)
        self.assertEqual(item.memberCount, 1)

    def test_j_legacy_routes_are_not_registered(self) -> None:
        paths = {getattr(route, "path", "") for route in create_app().routes}
        self.assertFalse([p for p in paths if p.startswith("/sessions")])
        self.assertEqual(
            sorted(p for p in paths if "attendance" in p),
            [
                "/activities/{activityId}/occurrences/{occurrenceId}/participants/{participantId}/attendance",
                "/activities/{activityId}/participants/{participantId}/attendance",
            ],
        )
        self.assertIn("/home", paths)

    async def _legacy_rows(self, circle_id: str) -> list[tuple[object, ...]]:
        rows = await self.conn.fetch(
            """
            SELECT s.id, s."dateTime", s."locationOrLink", a."userId", a.status
            FROM sessions s
            LEFT JOIN attendance a ON a."sessionId" = s.id
            WHERE s."circleId" = $1
            ORDER BY s.id, a."userId"
            """,
            UUID(circle_id),
        )
        return [tuple(row.values()) for row in rows]

    async def _read_everything(self, circle_id: str) -> None:
        for user_id in (self.creator_id, self.joiner_id):
            await fetch_home(self.conn, user_id)
            await list_circles_catalog(self.conn, user_id=user_id, lang="en")
        await get_my_circle(circleId=circle_id, conn=self.conn, user=CurrentUser(id=self.creator_id), lang="en")

    async def test_k_reads_never_create_sessions(self) -> None:
        circle = await self._create()
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=circle.inviteCode)
        before = await self._legacy_counts()
        await self._read_everything(circle.id)
        self.assertEqual(await self._legacy_counts(), before)
        self.assertEqual(await self._legacy_rows(circle.id), [])
        with self.assertRaises(ModuleNotFoundError):
            __import__("app.services.session_replenish")

    async def test_l_historical_rows_survive_every_circle_flow(self) -> None:
        circle_id, _ = await self._with_legacy_future_session()
        await self.conn.execute(
            'INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink") VALUES ($1, $2, $3, $4)',
            uuid4(),
            UUID(circle_id),
            datetime.now(tz=timezone.utc) - timedelta(days=21),
            "Previous meeting place",
        )
        before_rows = await self._legacy_rows(circle_id)
        before_counts = await self._legacy_counts()
        await self._create()
        invite_code = await self.conn.fetchval('SELECT "inviteCode" FROM circles WHERE id = $1', UUID(circle_id))
        await join_circle(self.conn, user_id=self.joiner_id, invite_code=invite_code)
        await patch_circle(
            self.conn,
            user_id=self.creator_id,
            circle_id=UUID(circle_id),
            description="Still meeting",
            update_description=True,
        )
        created = await create_activity(
            self.conn, user_id=self.creator_id, circle_id=UUID(circle_id), payload=_create_payload()
        )
        await publish_activity(self.conn, user_id=self.creator_id, activity_id=UUID(created.id))
        await self._read_everything(circle_id)
        self.assertEqual(await self._legacy_rows(circle_id), before_rows)
        self.assertEqual(await self._legacy_counts(), before_counts)

    async def test_m_activity_dates_still_top_up(self) -> None:
        circle = await self._create()
        created = await create_activity(
            self.conn,
            user_id=self.creator_id,
            circle_id=UUID(circle.id),
            payload=_create_payload(recurrenceType="recurring", recurrenceRule="Mon 18:00"),
        )
        await publish_activity(self.conn, user_id=self.creator_id, activity_id=UUID(created.id))
        await self.conn.execute(
            """
            UPDATE activity_occurrences SET status = 'cancelled'
            WHERE id = (
              SELECT id FROM activity_occurrences WHERE activity_id = $1 ORDER BY scheduled_at DESC LIMIT 1
            )
            """,
            UUID(created.id),
        )
        before = await self._legacy_counts()
        self.assertEqual(await ensure_future_activity_occurrences(self.conn, UUID(created.id)), 1)
        self.assertEqual(await self._legacy_counts(), before)

    async def test_o_invitation_accept_needs_no_session(self) -> None:
        circle = await self._create(inviteOnly=True)
        before = await self._legacy_counts()
        invitation = await create_invitation(
            self.conn, user_id=self.creator_id, circle_id=UUID(circle.id), invitee_id=self.joiner_id
        )
        accepted = await respond_to_invitation(
            self.conn, user_id=self.joiner_id, invitation_id=UUID(str(invitation["id"])), accept=True
        )
        self.assertEqual(accepted["status"], "accepted")
        self.assertTrue(await self._is_member(self.joiner_id, circle.id))
        self.assertEqual(await self._legacy_counts(), before)
        details = await get_my_circle(circleId=circle.id, conn=self.conn, user=CurrentUser(id=self.joiner_id), lang="en")
        self.assertIn(str(self.joiner_id), [m.id for m in details.members])

    async def test_p_api_contracts_have_no_session_fields(self) -> None:
        for model in (
            schemas.HomeResponse,
            schemas.HomeCircleItem,
            schemas.CircleMeResponse,
            schemas.CircleListItemResponse,
        ):
            for field in _SESSION_FIELDS:
                self.assertNotIn(field, model.model_fields, f"{model.__name__}.{field}")
        self.assertNotIn("firstSessionAt", CircleCreateRequest.model_fields)
        for name in ("SessionResponse", "AttendanceResponse", "AttendanceUpsertRequest", "HomeCalendarSession"):
            self.assertFalse(hasattr(schemas, name), name)
        circle = await self._create()
        home = (await fetch_home(self.conn, self.creator_id)).model_dump()
        for field in _SESSION_FIELDS:
            self.assertNotIn(field, home)
            for item in home["myCircles"]:
                self.assertNotIn(field, item)
        details = await get_my_circle(circleId=circle.id, conn=self.conn, user=CurrentUser(id=self.creator_id), lang="en")
        self.assertNotIn("nextSessionAt", details.model_dump())


if __name__ == "__main__":
    unittest.main()

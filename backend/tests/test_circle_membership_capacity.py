"""Circle membership is unlimited; Activity group size limits participation only.

These tests commit their own users and Circle so parallel attempts can use
independent connections. Everything they create is deleted in tearDown.
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import unittest
from datetime import datetime, time, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv
from fastapi import HTTPException

from app.services.activities_service import create_activity, publish_activity
from app.services.activity_participants import join_activity
from app.services.circle_invitations import create_invitation, respond_to_invitation
from app.services.circle_members import activate_member
from app.services.circles_service import get_circle_me, join_circle, list_circles_catalog
from tests.test_activities import ROOT, _create_payload

TYPICAL_SIZE = 6


def _future_start() -> datetime:
    day = datetime.now(timezone.utc) + timedelta(days=7)
    return day.replace(hour=18, minute=0, second=0, microsecond=0)


class CircleMembershipCapacityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        load_dotenv(ROOT / "backend" / ".env")
        self.url = os.getenv("DATABASE_URL")
        if not self.url:
            self.skipTest("DATABASE_URL missing")
        try:
            self.conn = await asyncpg.connect(self.url)
        except Exception as exc:
            self.skipTest(f"database unavailable: {exc.__class__.__name__}")
        self.user_ids: list[UUID] = []
        self.circle_id: UUID | None = None
        self.ritual_type = await self.conn.fetchval("SELECT slug FROM hobies ORDER BY slug LIMIT 1") or "padel"

    async def asyncTearDown(self) -> None:
        conn = getattr(self, "conn", None)
        if conn is None:
            return
        try:
            if self.circle_id is not None:
                await conn.execute("DELETE FROM circles WHERE id = $1", self.circle_id)
            if self.user_ids:
                await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", self.user_ids)
        finally:
            await conn.close()

    async def _user(self) -> UUID:
        user_id = uuid4()
        tag = secrets.token_hex(4)
        await self.conn.execute(
            """
            INSERT INTO users (id, user_name, first_name, last_name, availability_day, availability_time)
            VALUES ($1, $2, 'Capacity', $3, 'Mon', $4)
            """,
            user_id,
            f"capacity-test-{tag}",
            tag,
            time(18, 0),
        )
        self.user_ids.append(user_id)
        return user_id

    async def _circle_with_members(self, count: int) -> tuple[UUID, str, list[UUID]]:
        """A Circle with Typical Group Size 6 and `count` active members, the first being the owner."""
        members = [await self._user() for _ in range(count)]
        self.circle_id = uuid4()
        invite_code = f"cap{secrets.token_hex(4)}"
        await self.conn.execute(
            """
            INSERT INTO circles (
              id, "ritualType", modality, "recurringTime", "inviteCode", created_by,
              "maxSize", group_size_json, invite_only
            )
            VALUES ($1, $2, 'online', 'Mon 18:00', $3, $4, $5, $6::jsonb, FALSE)
            """,
            self.circle_id,
            self.ritual_type,
            invite_code,
            members[0],
            TYPICAL_SIZE,
            json.dumps({"type": "fixed", "min": TYPICAL_SIZE, "max": TYPICAL_SIZE}),
        )
        for user_id in members:
            await activate_member(self.conn, user_id=user_id, circle_id=self.circle_id)
        return self.circle_id, invite_code, members

    async def _active_members(self) -> int:
        value = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM circle_members WHERE circle_id = $1 AND status = 'active'",
            self.circle_id,
        )
        return int(value)

    async def _member_rows(self, user_id: UUID) -> int:
        value = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM circle_members WHERE circle_id = $1 AND user_id = $2",
            self.circle_id,
            user_id,
        )
        return int(value)

    async def _open_activity(self, owner: UUID, group_size: int) -> UUID:
        created = await create_activity(
            self.conn,
            user_id=owner,
            circle_id=self.circle_id,
            payload=_create_payload(title="Capacity check", startAt=_future_start(), groupSize=group_size),
        )
        await publish_activity(self.conn, user_id=owner, activity_id=UUID(created.id))
        return UUID(created.id)

    async def _going(self, activity_id: UUID) -> int:
        value = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_participants WHERE activity_id = $1 AND status = 'going'",
            activity_id,
        )
        return int(value)

    async def test_a_seventh_person_joins_by_invite_code(self) -> None:
        _, invite_code, _ = await self._circle_with_members(TYPICAL_SIZE)
        seventh = await self._user()

        await join_circle(self.conn, user_id=seventh, invite_code=invite_code)

        self.assertEqual(await self._active_members(), TYPICAL_SIZE + 1)
        self.assertEqual(await self._member_rows(seventh), 1)

    async def test_b_seventh_person_accepts_an_invitation(self) -> None:
        circle_id, _, members = await self._circle_with_members(TYPICAL_SIZE)
        seventh = await self._user()
        invitation = await create_invitation(self.conn, user_id=members[0], circle_id=circle_id, invitee_id=seventh)

        saved = await respond_to_invitation(
            self.conn, user_id=seventh, invitation_id=UUID(str(invitation["id"])), accept=True
        )

        self.assertEqual(saved["status"], "accepted")
        self.assertEqual(await self._active_members(), TYPICAL_SIZE + 1)

    async def test_c_a_circle_larger_than_its_typical_size_stays_valid_and_open(self) -> None:
        circle_id, invite_code, members = await self._circle_with_members(TYPICAL_SIZE + 4)

        _, listed = await get_circle_me(self.conn, user_id=members[0], circle_id=circle_id)
        self.assertEqual(len(listed), TYPICAL_SIZE + 4)

        catalog = [c for c in await list_circles_catalog(self.conn, user_id=members[0]) if c["id"] == str(circle_id)]
        self.assertEqual(len(catalog), 1)
        self.assertEqual(catalog[0]["memberCount"], TYPICAL_SIZE + 4)
        for key in catalog[0]:
            self.assertNotIn("full", key.lower())
            self.assertNotIn("ready", key.lower())

        newcomer = await self._user()
        await join_circle(self.conn, user_id=newcomer, invite_code=invite_code)
        self.assertEqual(await self._active_members(), TYPICAL_SIZE + 5)

    async def test_d_activity_group_size_still_rejects_the_seventh_participant(self) -> None:
        _, _, members = await self._circle_with_members(TYPICAL_SIZE + 1)
        activity_id = await self._open_activity(members[0], group_size=TYPICAL_SIZE)
        for user_id in members[:TYPICAL_SIZE]:
            await join_activity(self.conn, user_id=user_id, activity_id=activity_id)

        with self.assertRaises(HTTPException) as caught:
            await join_activity(self.conn, user_id=members[TYPICAL_SIZE], activity_id=activity_id)

        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(await self._going(activity_id), TYPICAL_SIZE)
        self.assertEqual(await self._active_members(), TYPICAL_SIZE + 1)

    async def test_e_parallel_joins_past_the_typical_size_all_succeed(self) -> None:
        _, invite_code, _ = await self._circle_with_members(TYPICAL_SIZE)
        first = await self._user()
        second = await self._user()

        async def attempt(user_id: UUID) -> int | None:
            conn = await asyncpg.connect(self.url)
            try:
                await join_circle(conn, user_id=user_id, invite_code=invite_code)
                return None
            except HTTPException as exc:
                return exc.status_code
            finally:
                await conn.close()

        codes = await asyncio.gather(attempt(first), attempt(second), attempt(first))

        self.assertEqual(codes, [None, None, None])
        self.assertEqual(await self._active_members(), TYPICAL_SIZE + 2)
        self.assertEqual(await self._member_rows(first), 1)
        self.assertEqual(await self._member_rows(second), 1)

    async def test_two_members_racing_for_the_last_place_of_a_one_time_activity(self) -> None:
        _, _, members = await self._circle_with_members(3)
        owner, user_a, user_b = members
        activity_id = await self._open_activity(owner, group_size=2)
        await join_activity(self.conn, user_id=owner, activity_id=activity_id)

        async def attempt(user_id: UUID) -> int | None:
            conn = await asyncpg.connect(self.url)
            try:
                await join_activity(conn, user_id=user_id, activity_id=activity_id)
                return None
            except HTTPException as exc:
                return exc.status_code
            finally:
                await conn.close()

        codes = await asyncio.gather(attempt(user_a), attempt(user_b))

        self.assertCountEqual(codes, [None, 409])
        self.assertEqual(await self._going(activity_id), 2)
        duplicates = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM (
              SELECT user_id FROM activity_participants
              WHERE activity_id = $1
              GROUP BY user_id HAVING COUNT(*) > 1
            ) d
            """,
            activity_id,
        )
        self.assertEqual(int(duplicates), 0)
        self.assertEqual(await self._active_members(), 3)


if __name__ == "__main__":
    unittest.main()

"""Activity foundation. Database checks roll back and do not keep rows."""

from __future__ import annotations

import os
import re
import unittest
import inspect
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas import ActivityCreateRequest, ActivityUpdateRequest
from app.services.activities_service import (
    activity_defaults_for_circle,
    cancel_activity,
    confirm_activity,
    create_activity,
    get_activity,
    publish_activity,
    get_activity_defaults,
    list_activities_for_circle,
    update_activity,
)
from app.services.circle_members import activate_member
from app.services.circle_activity_defaults import activity_location_defaults, get_preferred_activity_size
from app.services.circle_invitations import create_invitation, open_shared_circle_link
from app.services.circles_service import _complete_join_transaction
from app.services.activity_rules import ensure_status_change, prepare_activity_fields
from app.services.circle_members import activate_member

ROOT = Path(__file__).resolve().parents[2]
NEW_ACTIVITY_FILES = (
    ROOT / "db" / "migrations" / "039_activities.sql",
    ROOT / "backend" / "app" / "services" / "activity_rules.py",
    ROOT / "backend" / "app" / "services" / "activities_service.py",
    ROOT / "backend" / "app" / "services" / "circle_activity_defaults.py",
    ROOT / "backend" / "app" / "routers" / "activities.py",
)


def _start() -> datetime:
    return datetime(2026, 11, 2, 18, 0, tzinfo=timezone.utc)


def _create_payload(**overrides: object) -> ActivityCreateRequest:
    data: dict[str, object] = {
        "title": "Evening tennis",
        "startAt": _start(),
        "groupSize": 4,
        "paymentType": "free",
    }
    data.update(overrides)
    return ActivityCreateRequest.model_validate(data)


class ActivityRuleTests(unittest.TestCase):
    def test_paid_without_price_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            _create_payload(paymentType="paid", currency="CHF")
        with self.assertRaises(ValueError):
            prepare_activity_fields(
                title="Court",
                description=None,
                start_at=_start(),
                end_at=None,
                recurrence_type="one_time",
                recurrence_rule=None,
                location_name=None,
                location_address=None,
                group_size=4,
                payment_type="paid",
                price_amount=None,
                currency="CHF",
                status="draft",
                require_group_size=True,
            )

    def test_paid_with_price_and_currency_is_accepted(self) -> None:
        payload = _create_payload(paymentType="paid", priceAmount=Decimal("25.00"), currency="chf")
        self.assertEqual(payload.paymentType, "paid")
        fields = prepare_activity_fields(
            title=payload.title,
            description=None,
            start_at=payload.startAt,
            end_at=None,
            recurrence_type="one_time",
            recurrence_rule=None,
            location_name=None,
            location_address=None,
            group_size=4,
            payment_type="paid",
            price_amount=payload.priceAmount,
            currency=payload.currency,
            status="draft",
            require_group_size=True,
        )
        self.assertEqual(fields["price_amount"], Decimal("25.00"))
        self.assertEqual(fields["currency"], "CHF")

    def test_end_not_after_start_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            _create_payload(endAt=_start())
        with self.assertRaises(ValidationError):
            _create_payload(endAt=_start() - timedelta(hours=1))

    def test_group_size_zero_or_negative_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            _create_payload(groupSize=0)
        with self.assertRaises(ValidationError):
            _create_payload(groupSize=-2)
        with self.assertRaises(ValidationError):
            ActivityUpdateRequest.model_validate({"groupSize": 0})

    def test_min_participants_validation(self) -> None:
        with self.assertRaises(ValidationError):
            _create_payload(groupSize=4, minParticipants=0)
        with self.assertRaises(ValidationError):
            _create_payload(groupSize=4, minParticipants=5)
        payload = _create_payload(groupSize=4, minParticipants=3)
        self.assertEqual(payload.minParticipants, 3)

    def test_new_files_use_activity_names(self) -> None:
        blob = "\n".join(path.read_text(encoding="utf-8") for path in NEW_ACTIVITY_FILES)
        self.assertNotIn("Event", blob)
        service = (ROOT / "backend" / "app" / "services" / "activities_service.py").read_text(encoding="utf-8")
        legacy_attendance = re.compile(r"\b(from|join|into|update)\s+(public\.)?\"?attendance\b")
        self.assertIsNone(legacy_attendance.search(service.lower()))
        self.assertNotIn("sessions", service.lower())

    def test_only_draft_can_be_published(self) -> None:
        ensure_status_change("draft", "open")
        ensure_status_change("draft", "cancelled")
        ensure_status_change("open", "confirmed")
        ensure_status_change("open", "cancelled")
        ensure_status_change("confirmed", "completed")
        ensure_status_change("confirmed", "cancelled")
        ensure_status_change("open", "open")
        for current, new in (
            ("draft", "confirmed"),
            ("draft", "completed"),
            ("open", "draft"),
            ("open", "completed"),
            ("confirmed", "open"),
            ("confirmed", "draft"),
            ("completed", "open"),
            ("completed", "cancelled"),
            ("cancelled", "open"),
            ("cancelled", "confirmed"),
            ("cancelled", "completed"),
        ):
            with self.assertRaises(ValueError):
                ensure_status_change(current, new)


class ActivityDefaultRuleTests(unittest.TestCase):
    def test_generic_city_is_context_not_an_address(self) -> None:
        name, address = activity_location_defaults(
            meeting_place=None,
            city="Zurich",
            city_name=None,
        )
        self.assertEqual(name, "Zurich")
        self.assertIsNone(address)

    def test_specific_place_keeps_the_city_out_of_the_address(self) -> None:
        name, address = activity_location_defaults(
            meeting_place="Tennisanlage Mythenquai",
            city="Zurich",
            city_name="Zurich",
        )
        self.assertEqual(name, "Tennisanlage Mythenquai")
        self.assertIsNone(address)

    def test_stored_place_address_is_split(self) -> None:
        name, address = activity_location_defaults(
            meeting_place="Tennisanlage Mythenquai — Mythenquai 200, Zürich",
            city="Zurich",
            city_name="Zurich",
        )
        self.assertEqual(name, "Tennisanlage Mythenquai")
        self.assertEqual(address, "Mythenquai 200, Zürich")

    def test_preferred_size_uses_group_size_then_max_size(self) -> None:
        self.assertEqual(get_preferred_activity_size({"type": "fixed", "min": 4, "max": 4}, 6), 4)
        self.assertEqual(get_preferred_activity_size({"type": "max", "max": 5}, 6), 5)
        self.assertEqual(get_preferred_activity_size({"type": "min", "min": 3}, 6), 3)
        self.assertEqual(get_preferred_activity_size({"type": "range", "min": 2, "max": 5}, 6), 5)
        self.assertEqual(get_preferred_activity_size(None, 6), 6)

    def test_join_and_invite_do_not_use_preferred_size(self) -> None:
        for fn in (_complete_join_transaction, create_invitation, open_shared_circle_link):
            source = inspect.getsource(fn).lower()
            self.assertNotIn("circle is full", source)
            self.assertNotIn("get_preferred_activity_size", source)
            self.assertNotIn("group_size", source)


class ActivityDatabaseTests(unittest.IsolatedAsyncioTestCase):
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
        attendance = await self.conn.fetchval('SELECT COUNT(*)::int FROM attendance')
        return int(sessions), int(attendance)

    async def test_create_one_time_free_does_not_touch_sessions(self) -> None:
        before = await self._counts()
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(),
        )
        self.assertEqual(created.recurrenceType, "one_time")
        self.assertIsNone(created.recurrenceRule)
        self.assertEqual(created.paymentType, "free")
        self.assertIsNone(created.priceAmount)
        self.assertIsNone(created.currency)
        self.assertEqual(created.status, "draft")
        self.assertEqual(await self._counts(), before)

    async def test_defaults_are_copied_onto_the_activity(self) -> None:
        await self.conn.execute(
            """
            UPDATE circles
            SET meeting_place = $2,
                city = $3,
                city_name = $4,
                group_size_json = $5::jsonb,
                "maxSize" = 4
            WHERE id = $1
            """,
            self.circle_id,
            "Tennisanlage Mythenquai — Mythenquai 200, Zürich",
            "Zurich",
            "Zurich",
            '{"type":"fixed","min":4,"max":4}',
        )
        defaults = await activity_defaults_for_circle(self.conn, circle_id=self.circle_id)
        self.assertEqual(defaults.location_name, "Tennisanlage Mythenquai")
        self.assertEqual(defaults.location_address, "Mythenquai 200, Zürich")
        self.assertEqual(defaults.group_size, 4)
        before = await self._counts()
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(groupSize=None, locationName=None, locationAddress=None),
        )
        self.assertEqual(created.locationName, "Tennisanlage Mythenquai")
        self.assertEqual(created.locationAddress, "Mythenquai 200, Zürich")
        self.assertEqual(created.groupSize, 4)
        self.assertEqual(await self._counts(), before)
        await self.conn.execute(
            """
            UPDATE circles
            SET meeting_place = $2, city_name = $3, group_size_json = $4::jsonb
            WHERE id = $1
            """,
            self.circle_id,
            "Somewhere else",
            "Bern",
            '{"type":"fixed","min":2,"max":2}',
        )
        listed = await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        saved = next(item for item in listed if item.id == created.id)
        self.assertEqual(saved.locationName, "Tennisanlage Mythenquai")
        self.assertEqual(saved.locationAddress, "Mythenquai 200, Zürich")
        self.assertEqual(saved.groupSize, 4)
        self.assertEqual(await self._counts(), before)

    async def test_generic_city_defaults_and_later_activity_uses_new_size(self) -> None:
        await self.conn.execute(
            """
            UPDATE circles
            SET meeting_place = NULL,
                city = $2,
                city_name = NULL,
                group_size_json = $3::jsonb,
                "maxSize" = 6
            WHERE id = $1
            """,
            self.circle_id,
            "Zurich",
            '{"type":"fixed","min":6,"max":6}',
        )
        defaults = await get_activity_defaults(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        self.assertEqual(defaults.locationName, "Zurich")
        self.assertIsNone(defaults.locationAddress)
        self.assertEqual(defaults.preferredGroupSize, 6)
        before = await self._counts()
        first = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Activity A", groupSize=None, locationName=None, locationAddress=None),
        )
        self.assertEqual(first.locationName, "Zurich")
        self.assertIsNone(first.locationAddress)
        self.assertEqual(first.groupSize, 6)
        await self.conn.execute(
            """
            UPDATE circles
            SET city_name = $2, group_size_json = $3::jsonb
            WHERE id = $1
            """,
            self.circle_id,
            "Bern",
            '{"type":"fixed","min":8,"max":8}',
        )
        listed = await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        saved = next(item for item in listed if item.id == first.id)
        self.assertEqual(saved.locationName, "Zurich")
        self.assertEqual(saved.groupSize, 6)
        second = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Activity B", groupSize=None, locationName=None, locationAddress=None),
        )
        self.assertEqual(second.locationName, "Bern")
        self.assertIsNone(second.locationAddress)
        self.assertEqual(second.groupSize, 8)
        self.assertEqual(await self._counts(), before)

    async def test_override_does_not_change_the_circle(self) -> None:
        await self.conn.execute(
            """
            UPDATE circles
            SET meeting_place = NULL,
                city = $2,
                city_name = $2,
                group_size_json = $3::jsonb,
                "maxSize" = 6
            WHERE id = $1
            """,
            self.circle_id,
            "Zurich",
            '{"type":"fixed","min":6,"max":6}',
        )
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(
                locationName="Tennisanlage Mythenquai",
                locationAddress=None,
                groupSize=4,
            ),
        )
        self.assertEqual(created.locationName, "Tennisanlage Mythenquai")
        self.assertIsNone(created.locationAddress)
        self.assertEqual(created.groupSize, 4)
        circle = await self.conn.fetchrow(
            """
            SELECT meeting_place, city, city_name, "maxSize" AS max_size, group_size_json
            FROM circles WHERE id = $1
            """,
            self.circle_id,
        )
        self.assertIsNone(circle["meeting_place"])
        self.assertEqual(circle["city"], "Zurich")
        self.assertEqual(int(circle["max_size"]), 6)
        self.assertEqual(get_preferred_activity_size(circle["group_size_json"], circle["max_size"]), 6)

    async def test_paid_activity_is_stored(self) -> None:
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(paymentType="paid", priceAmount=Decimal("25.50"), currency="CHF"),
        )
        self.assertEqual(created.paymentType, "paid")
        self.assertEqual(created.priceAmount, Decimal("25.50"))
        self.assertEqual(created.currency, "CHF")

    async def test_outsider_and_attendance_only_are_rejected(self) -> None:
        outsider = await self.conn.fetchval(
            "SELECT id FROM users WHERE id <> $1 LIMIT 1",
            self.owner_id,
        )
        if outsider is None:
            self.skipTest("need a second user")
        await self.conn.execute(
            """
            INSERT INTO circle_members (id, circle_id, user_id, status)
            VALUES ($1, $2, $3, 'left')
            ON CONFLICT (circle_id, user_id) DO UPDATE SET status = 'left'
            """,
            uuid4(),
            self.circle_id,
            outsider,
        )
        session_id = await self.conn.fetchval(
            'SELECT id FROM sessions WHERE "circleId" = $1 LIMIT 1',
            self.circle_id,
        )
        if session_id is None:
            session_id = uuid4()
            await self.conn.execute(
                """
                INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
                VALUES ($1, $2, $3, 'Court')
                """,
                session_id,
                self.circle_id,
                _start(),
            )
        await self.conn.execute(
            """
            INSERT INTO attendance ("userId", "sessionId", status)
            VALUES ($1, $2, 'attending')
            ON CONFLICT ("userId", "sessionId") DO UPDATE SET status = 'attending'
            """,
            outsider,
            session_id,
        )
        before = await self._counts()
        with self.assertRaises(HTTPException) as raised:
            await create_activity(
                self.conn,
                user_id=outsider,
                circle_id=self.circle_id,
                payload=_create_payload(),
            )
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(await self._counts(), before)

    async def test_list_returns_only_that_circle(self) -> None:
        mine = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="This circle"),
        )
        other_circle = uuid4()
        await self.conn.execute(
            """
            INSERT INTO circles (id, "ritualType", modality, "recurringTime", "maxSize", "inviteCode", created_by)
            VALUES ($1, 'tennis', 'offline', 'Sun 10:00', 4, $2, $3)
            """,
            other_circle,
            uuid4().hex[:8],
            self.member_id,
        )
        await activate_member(self.conn, user_id=self.member_id, circle_id=other_circle)
        other = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=other_circle,
            payload=_create_payload(title="Other circle"),
        )
        listed = await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        ids = {item.id for item in listed}
        self.assertIn(mine.id, ids)
        self.assertNotIn(other.id, ids)

    async def test_update_and_cancel_leave_sessions_unchanged(self) -> None:
        before = await self._counts()
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Saturday hit"),
        )
        updated = await update_activity(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(created.id),
            payload=ActivityUpdateRequest(title="Saturday match"),
        )
        self.assertEqual(updated.title, "Saturday match")
        cancelled = await cancel_activity(
            self.conn,
            user_id=self.owner_id,
            activity_id=UUID(created.id),
        )
        self.assertEqual(cancelled.status, "cancelled")
        self.assertEqual(await self._counts(), before)

    async def test_draft_visible_only_to_creator_or_owner(self) -> None:
        other = await self.conn.fetchval(
            "SELECT id FROM users WHERE id <> $1 AND id <> $2 LIMIT 1",
            self.member_id,
            self.owner_id,
        )
        if other is None:
            self.skipTest("needs a second user")
        await activate_member(self.conn, circle_id=self.circle_id, user_id=other)
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Draft tennis"),
        )
        self.assertEqual(created.status, "draft")
        hidden = await list_activities_for_circle(self.conn, user_id=other, circle_id=self.circle_id)
        self.assertNotIn(created.id, {item.id for item in hidden})
        with self.assertRaises(HTTPException) as raised:
            await get_activity(self.conn, user_id=other, activity_id=UUID(created.id))
        self.assertEqual(raised.exception.status_code, 404)
        visible_to_creator = await list_activities_for_circle(
            self.conn, user_id=self.member_id, circle_id=self.circle_id
        )
        self.assertIn(created.id, {item.id for item in visible_to_creator})
        visible_to_owner = await list_activities_for_circle(
            self.conn, user_id=self.owner_id, circle_id=self.circle_id
        )
        self.assertIn(created.id, {item.id for item in visible_to_owner})
        opened = await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        self.assertEqual(opened.status, "open")
        shown = await list_activities_for_circle(self.conn, user_id=other, circle_id=self.circle_id)
        self.assertIn(created.id, {item.id for item in shown})

    async def test_publish_edit_and_cancel_stay_on_the_activity(self) -> None:
        other = await self.conn.fetchval(
            "SELECT id FROM users WHERE id <> $1 AND id <> $2 LIMIT 1",
            self.member_id,
            self.owner_id,
        )
        if other is None:
            self.skipTest("needs a second user")
        await activate_member(self.conn, circle_id=self.circle_id, user_id=other)
        before = await self._counts()
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(title="Morning tennis", groupSize=6),
        )
        published = await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        self.assertEqual(published.status, "open")
        visible = await get_activity(self.conn, user_id=other, activity_id=UUID(created.id))
        self.assertEqual(visible.title, "Morning tennis")
        with self.assertRaises(HTTPException) as denied:
            await update_activity(
                self.conn,
                user_id=other,
                activity_id=UUID(created.id),
                payload=ActivityUpdateRequest(title="Taken over"),
            )
        self.assertEqual(denied.exception.status_code, 403)
        with self.assertRaises(HTTPException) as denied_cancel:
            await cancel_activity(self.conn, user_id=other, activity_id=UUID(created.id))
        self.assertEqual(denied_cancel.exception.status_code, 403)
        edited = await update_activity(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(created.id),
            payload=ActivityUpdateRequest(title="Morning match", locationName="Court A"),
        )
        self.assertEqual(edited.title, "Morning match")
        self.assertEqual(edited.groupSize, 6)
        self.assertEqual(edited.locationName, "Court A")
        self.assertEqual(edited.status, "open")
        cancelled = await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        self.assertEqual(cancelled.status, "cancelled")
        still = await get_activity(self.conn, user_id=other, activity_id=UUID(created.id))
        self.assertEqual(still.status, "cancelled")
        with self.assertRaises(HTTPException) as reopened:
            await update_activity(
                self.conn,
                user_id=self.member_id,
                activity_id=UUID(created.id),
                payload=ActivityUpdateRequest(status="open"),
            )
        self.assertEqual(reopened.exception.status_code, 400)
        self.assertEqual(await self._counts(), before)

    async def test_only_the_activity_creator_can_edit(self) -> None:
        creator = self.member_id
        if creator == self.owner_id:
            creator = await self.conn.fetchval("SELECT id FROM users WHERE id <> $1 LIMIT 1", self.owner_id)
            if creator is None:
                self.skipTest("needs a member who is not the circle owner")
            await activate_member(self.conn, circle_id=self.circle_id, user_id=creator)
        created = await create_activity(
            self.conn,
            user_id=creator,
            circle_id=self.circle_id,
            payload=_create_payload(title="Great Game"),
        )
        opened = await publish_activity(self.conn, user_id=creator, activity_id=UUID(created.id))
        confirmed = await confirm_activity(self.conn, user_id=creator, activity_id=UUID(opened.id))
        self.assertTrue(confirmed.actions.canEdit)
        owner_view = await get_activity(self.conn, user_id=self.owner_id, activity_id=UUID(created.id))
        self.assertFalse(owner_view.actions.canEdit)
        self.assertTrue(owner_view.actions.canCancel)
        listed = await list_activities_for_circle(self.conn, user_id=self.owner_id, circle_id=self.circle_id)
        listed_item = next(item for item in listed if item.id == created.id)
        self.assertFalse(listed_item.actions.canEdit)
        with self.assertRaises(HTTPException) as denied:
            await update_activity(
                self.conn,
                user_id=self.owner_id,
                activity_id=UUID(created.id),
                payload=ActivityUpdateRequest(title="Owner edit"),
            )
        self.assertEqual(denied.exception.status_code, 403)
        kept = await get_activity(self.conn, user_id=creator, activity_id=UUID(created.id))
        self.assertEqual(kept.title, "Great Game")
        self.assertTrue(kept.actions.canEdit)

"""In-app Activity notifications. Database checks roll back and do not keep rows."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID

import asyncpg
from dotenv import load_dotenv
from fastapi import HTTPException

from app.schemas import ActivitySuggestionCreate, ActivityUpdateRequest
from app.services.activities_service import (
    cancel_activity,
    confirm_activity,
    create_activity,
    publish_activity,
    update_activity,
)
from app.services.activity_notifications import (
    add_due_reminders,
    list_activity_notifications,
    notify_cancelled,
    notify_confirmed,
)
from app.services.activity_participants import (
    join_activity,
    join_occurrence,
    leave_activity,
    reconfirm_activity,
)
from app.services.activity_suggestions import (
    accept_suggestion,
    create_suggestion,
    decline_suggestion,
    support_suggestion,
    withdraw_suggestion,
)
from app.services.circle_members import activate_member, leave_member
from app.user_fields import user_display_label
from tests.test_activities import ROOT, _create_payload

LATER = datetime(2026, 11, 3, 14, 0, tzinfo=timezone.utc)
LATER_END = datetime(2026, 11, 3, 16, 0, tzinfo=timezone.utc)
_DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _time(**overrides: object) -> ActivitySuggestionCreate:
    data: dict[str, object] = {"type": "time", "proposedStartAt": LATER, "proposedEndAt": LATER_END, "note": "Secret note"}
    data.update(overrides)
    return ActivitySuggestionCreate.model_validate(data)


def _place(**overrides: object) -> ActivitySuggestionCreate:
    data: dict[str, object] = {
        "type": "location",
        "proposedLocationName": "Fluntern Courts",
        "proposedLocationAddress": "Hidden Street 7",
        "note": "Secret note",
    }
    data.update(overrides)
    return ActivitySuggestionCreate.model_validate(data)


def _soon() -> datetime:
    start = datetime.now(timezone.utc) + timedelta(hours=3)
    start = start.replace(second=0, microsecond=0)
    return start + timedelta(minutes=(15 - start.minute % 15) % 15)


class ActivityNotificationTests(unittest.IsolatedAsyncioTestCase):
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
        exists = await self.conn.fetchval("SELECT to_regclass('public.activity_notifications') IS NOT NULL")
        if not exists:
            self.skipTest("migration 045 not applied")
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
        self.organizer = row["user_id"]
        self.owner_id = row["created_by"]
        others = await self.conn.fetch(
            "SELECT id FROM users WHERE id <> $1 AND id <> $2 ORDER BY id LIMIT 3",
            self.organizer,
            self.owner_id,
        )
        if len(others) < 3:
            self.skipTest("needs three more users")
        self.a, self.b, self.outsider = (item["id"] for item in others)
        for user in (self.a, self.b):
            await activate_member(self.conn, user_id=user, circle_id=self.circle_id)
        await self.conn.execute(
            "UPDATE circle_members SET status = 'left' WHERE circle_id = $1 AND user_id = $2",
            self.circle_id,
            self.outsider,
        )

    async def asyncTearDown(self) -> None:
        tx = getattr(self, "tx", None)
        conn = getattr(self, "conn", None)
        if tx is not None:
            await tx.rollback()
        if conn is not None:
            await conn.close()

    async def _activity(self, **overrides: object):
        created = await create_activity(
            self.conn, user_id=self.organizer, circle_id=self.circle_id, payload=_create_payload(**overrides)
        )
        return await publish_activity(self.conn, user_id=self.organizer, activity_id=UUID(created.id))

    async def _weekly(self, start: datetime | None = None):
        start = start or datetime(2026, 11, 2, 18, 0, tzinfo=timezone.utc)
        return await self._activity(
            title="Weekly tennis",
            startAt=start,
            recurrenceType="recurring",
            recurrenceRule=f"{_DAYS[start.weekday()]} {start:%H:%M}",
            locationName="Park courts",
        )

    async def _rows(self, activity_id: str, kind: str | None = None) -> list[asyncpg.Record]:
        return await self.conn.fetch(
            """
            SELECT user_id, type, occurrence_id, suggestion_id FROM activity_notifications
            WHERE activity_id = $1 AND ($2::text IS NULL OR type = $2)
            ORDER BY type, user_id
            """,
            UUID(activity_id),
            kind,
        )

    async def _recipients(self, activity_id: str, kind: str) -> set[UUID]:
        return {row["user_id"] for row in await self._rows(activity_id, kind)}

    async def _join(self, activity, *users: UUID) -> None:
        for user in users:
            await join_activity(self.conn, user_id=user, activity_id=UUID(activity.id))

    async def test_a_confirm_notifies_people_going(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a, self.b)
        await confirm_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        self.assertEqual(await self._recipients(activity.id, "activity_confirmed"), {self.a, self.b})
        listed = await list_activity_notifications(self.conn, user_id=self.a)
        mine = [item for item in listed if item.activityId == activity.id]
        self.assertEqual([item.type for item in mine], ["activity_confirmed"])
        self.assertIsNone(mine[0].occurrenceId)
        self.assertFalse(mine[0].recurring)

    async def test_b_becoming_full_does_not_confirm(self) -> None:
        activity = await self._activity(groupSize=3)
        await self._join(activity, self.a, self.b)
        self.assertEqual(await self._rows(activity.id), [])

    async def test_c_cancel_one_time_skips_cancelled_participants(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a, self.b)
        await leave_activity(self.conn, user_id=self.b, activity_id=UUID(activity.id))
        await cancel_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id), reason="Rain")
        self.assertEqual(await self._recipients(activity.id, "activity_cancelled"), {self.a})
        listed = await list_activity_notifications(self.conn, user_id=self.a)
        cancelled = next(item for item in listed if item.activityId == activity.id)
        self.assertEqual(cancelled.cancellationNote, "Rain")

    async def test_d_cancel_recurring_date_only_that_date(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await join_occurrence(self.conn, user_id=self.a, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await join_occurrence(self.conn, user_id=self.b, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id))
        await cancel_activity(
            self.conn, user_id=self.organizer, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        rows = await self._rows(weekly.id, "activity_cancelled")
        self.assertEqual([(row["user_id"], str(row["occurrence_id"])) for row in rows], [(self.a, first.id)])

    async def test_e_time_change_notifies_people_going(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a)
        moved = activity.startAt + timedelta(hours=2)
        await update_activity(
            self.conn,
            user_id=self.organizer,
            activity_id=UUID(activity.id),
            payload=ActivityUpdateRequest(startAt=moved),
        )
        self.assertEqual(await self._recipients(activity.id, "activity_changed"), {self.a})

    async def test_f_location_change_notifies_and_title_does_not(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a)
        await update_activity(
            self.conn,
            user_id=self.organizer,
            activity_id=UUID(activity.id),
            payload=ActivityUpdateRequest(title="New title"),
        )
        self.assertEqual(await self._rows(activity.id), [])
        await update_activity(
            self.conn,
            user_id=self.organizer,
            activity_id=UUID(activity.id),
            payload=ActivityUpdateRequest(locationName="Another court"),
        )
        self.assertEqual(await self._recipients(activity.id, "activity_changed"), {self.a})

    async def test_g_reconfirm_only_flagged_participants(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a, self.b)
        await confirm_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        await leave_activity(self.conn, user_id=self.b, activity_id=UUID(activity.id))
        suggested = await create_suggestion(self.conn, user_id=self.a, activity_id=UUID(activity.id), payload=_time())
        suggestion = next(item for item in suggested.suggestions if item.status == "open")
        await accept_suggestion(self.conn, user_id=self.organizer, suggestion_id=UUID(suggestion.id))
        self.assertEqual(await self._recipients(activity.id, "reconfirmation_required"), {self.a})
        self.assertEqual(await self._rows(activity.id, "activity_changed"), [])
        organizer_flag = await self.conn.fetchval(
            """
            SELECT confirmation_required FROM activity_participants
            WHERE activity_id = $1 AND user_id = $2
            """,
            UUID(activity.id),
            self.organizer,
        )
        self.assertEqual(organizer_flag, False)

    async def test_h_still_going_resolves_without_duplicate(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a, self.b)
        await confirm_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        suggested = await create_suggestion(self.conn, user_id=self.a, activity_id=UUID(activity.id), payload=_time())
        suggestion = next(item for item in suggested.suggestions if item.status == "open")
        await accept_suggestion(self.conn, user_id=self.organizer, suggestion_id=UUID(suggestion.id))

        def _reconfirm(items):
            return [item for item in items if item.activityId == activity.id and item.type == "reconfirmation_required"]

        before = _reconfirm(await list_activity_notifications(self.conn, user_id=self.b))
        self.assertEqual(len(before), 1)
        self.assertFalse(before[0].resolved)
        await reconfirm_activity(self.conn, user_id=self.b, activity_id=UUID(activity.id))
        after = _reconfirm(await list_activity_notifications(self.conn, user_id=self.b))
        self.assertEqual(len(after), 1)
        self.assertTrue(after[0].resolved)

    async def test_i_accepted_notifies_creator_once(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a, self.b)
        suggested = await create_suggestion(self.conn, user_id=self.a, activity_id=UUID(activity.id), payload=_place())
        suggestion = next(item for item in suggested.suggestions if item.status == "open")
        await accept_suggestion(self.conn, user_id=self.organizer, suggestion_id=UUID(suggestion.id))
        accepted = await self._rows(activity.id, "suggestion_accepted")
        self.assertEqual([(row["user_id"], str(row["suggestion_id"])) for row in accepted], [(self.a, suggestion.id)])
        self.assertEqual(await self._recipients(activity.id, "activity_changed"), {self.b})

    async def test_j_declined_notifies_creator_once(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a)
        first = await create_suggestion(self.conn, user_id=self.a, activity_id=UUID(activity.id), payload=_time())
        own = next(item for item in first.suggestions if item.status == "open")
        await decline_suggestion(self.conn, user_id=self.organizer, suggestion_id=UUID(own.id))
        self.assertEqual(await self._recipients(activity.id, "suggestion_declined"), {self.a})
        self.assertEqual(len(await self._rows(activity.id, "suggestion_declined")), 1)

    async def test_j_second_suggestion_waits_for_the_open_one(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a, self.b)
        await create_suggestion(self.conn, user_id=self.a, activity_id=UUID(activity.id), payload=_time())
        with self.assertRaises(HTTPException) as blocked:
            await create_suggestion(
                self.conn,
                user_id=self.b,
                activity_id=UUID(activity.id),
                payload=_time(proposedStartAt=LATER + timedelta(days=1), proposedEndAt=LATER_END + timedelta(days=1)),
            )
        self.assertEqual(blocked.exception.status_code, 409)
        self.assertEqual(await self._recipients(activity.id, "suggestion_created"), {self.organizer, self.b})

    async def test_k_create_support_and_withdraw_stay_quiet(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a, self.b)
        suggested = await create_suggestion(self.conn, user_id=self.a, activity_id=UUID(activity.id), payload=_time())
        suggestion = next(item for item in suggested.suggestions if item.status == "open")
        self.assertEqual(await self._recipients(activity.id, "suggestion_created"), {self.organizer, self.b})
        await support_suggestion(self.conn, user_id=self.b, suggestion_id=UUID(suggestion.id))
        await withdraw_suggestion(self.conn, user_id=self.a, suggestion_id=UUID(suggestion.id))
        self.assertEqual(await self._recipients(activity.id, "suggestion_created"), {self.organizer, self.b})
        self.assertEqual(len(await self._rows(activity.id)), 2)

    async def test_l_upcoming_reminder_exactly_once(self) -> None:
        activity = await self._activity(startAt=_soon())
        await self._join(activity, self.a)
        far = await self._activity(title="Later")
        await self._join(far, self.a)
        await list_activity_notifications(self.conn, user_id=self.a)
        await list_activity_notifications(self.conn, user_id=self.a)
        self.assertEqual(await add_due_reminders(self.conn, user_id=self.a), 0)
        self.assertEqual(await self._recipients(activity.id, "upcoming_activity"), {self.a})
        self.assertEqual(len(await self._rows(activity.id, "upcoming_activity")), 1)
        self.assertEqual(await self._rows(far.id), [])

    async def test_m_cancelled_activity_or_date_gets_no_reminder(self) -> None:
        activity = await self._activity(startAt=_soon())
        await self._join(activity, self.a)
        await cancel_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        weekly = await self._weekly(_soon())
        first = weekly.occurrences[0]
        await join_occurrence(self.conn, user_id=self.a, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await cancel_activity(
            self.conn, user_id=self.organizer, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        await list_activity_notifications(self.conn, user_id=self.a)
        self.assertEqual(await self._rows(activity.id, "upcoming_activity"), [])
        self.assertEqual(await self._rows(weekly.id, "upcoming_activity"), [])

    async def test_n_cancelled_participant_or_leaver_gets_no_reminder(self) -> None:
        activity = await self._activity(startAt=_soon())
        await self._join(activity, self.a, self.b)
        await leave_activity(self.conn, user_id=self.a, activity_id=UUID(activity.id))
        await leave_member(self.conn, user_id=self.b, circle_id=self.circle_id)
        for user in (self.a, self.b):
            await list_activity_notifications(self.conn, user_id=user)
        self.assertEqual(await self._rows(activity.id, "upcoming_activity"), [])

    async def test_o_repeated_actions_do_not_duplicate(self) -> None:
        activity = await self._activity()
        await self._join(activity, self.a)
        await confirm_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        row = await self.conn.fetchrow("SELECT * FROM activities WHERE id = $1", UUID(activity.id))
        again = await notify_confirmed(
            self.conn, activity_id=row["id"], occurrence_id=None, confirmed_at=row["updated_at"], actor=self.organizer
        )
        self.assertEqual(again, 0)
        await cancel_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        self.assertEqual(await notify_cancelled(self.conn, activity_id=row["id"], occurrence_id=None, actor=self.organizer), 0)
        for _ in range(3):
            await list_activity_notifications(self.conn, user_id=self.a)
        kinds = [r["type"] for r in await self._rows(activity.id)]
        self.assertEqual(kinds, ["activity_cancelled", "activity_confirmed"])

    async def test_p_recurring_notifications_name_one_date(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        for occurrence in (first, second):
            await join_occurrence(
                self.conn, user_id=self.a, activity_id=UUID(weekly.id), occurrence_id=UUID(occurrence.id)
            )
        await confirm_activity(
            self.conn, user_id=self.organizer, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id)
        )
        rows = await self._rows(weekly.id)
        self.assertEqual([(row["type"], str(row["occurrence_id"])) for row in rows], [("activity_confirmed", second.id)])
        listed = await list_activity_notifications(self.conn, user_id=self.a)
        item = next(entry for entry in listed if entry.activityId == weekly.id)
        self.assertTrue(item.recurring)
        self.assertEqual(item.occurrenceId, second.id)
        self.assertEqual(item.startAt, second.startAt)

    async def test_q_legacy_tables_untouched_and_not_used(self) -> None:
        sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        activity = await self._activity(startAt=_soon())
        await self._join(activity, self.a)
        await confirm_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        await cancel_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        await list_activity_notifications(self.conn, user_id=self.b)
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions"), sessions)
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance"), attendance)
        self.assertEqual(await self._recipients(activity.id, "activity_cancelled"), {self.a})
        source = (ROOT / "backend" / "app" / "services" / "activity_notifications.py").read_text(encoding="utf-8")
        self.assertNotIn("attendance", source)
        self.assertNotIn("sessions", source)

    async def test_r_notifications_carry_no_private_details(self) -> None:
        activity = await self._activity(locationAddress="Private Road 1")
        await self._join(activity, self.a, self.b)
        suggested = await create_suggestion(self.conn, user_id=self.a, activity_id=UUID(activity.id), payload=_place())
        suggestion = next(item for item in suggested.suggestions if item.status == "open")
        await accept_suggestion(self.conn, user_id=self.organizer, suggestion_id=UUID(suggestion.id))
        users = await self.conn.fetch(
            "SELECT id, user_name, first_name, last_name FROM users WHERE id = ANY($1::uuid[])",
            [self.a, self.b, self.organizer],
        )
        by_id = {row["id"]: row for row in users}
        suggester = user_display_label(
            user_name=by_id[self.a]["user_name"],
            first_name=by_id[self.a]["first_name"],
            last_name=by_id[self.a]["last_name"],
        )
        display_names = [
            user_display_label(
                user_name=row["user_name"],
                first_name=row["first_name"],
                last_name=row["last_name"],
            )
            for row in users
        ]
        for user in (self.a, self.b):
            for item in await list_activity_notifications(self.conn, user_id=user):
                text = item.model_dump_json()
                for secret in ("Private Road 1", "Hidden Street 7", "Secret note", "Fluntern Courts"):
                    self.assertNotIn(secret, text)
                if item.type == "suggestion_created":
                    self.assertEqual(item.suggestedByName, suggester)
                    continue
                self.assertIsNone(item.suggestedByName)
                for name in display_names:
                    if len(name) > 3:
                        self.assertNotIn(f'"{name}"', text)
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM activity_notifications WHERE user_id = $1", self.outsider), 0)

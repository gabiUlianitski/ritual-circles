"""Time and place suggestions. Database checks roll back and do not keep rows."""

from __future__ import annotations

import asyncio
import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv
from fastapi import HTTPException

from app.schemas import ActivitySuggestionCreate
from app.services.activities_service import (
    cancel_activity,
    complete_activity,
    confirm_activity,
    create_activity,
    get_activity,
    publish_activity,
)
from app.services.activity_participants import join_activity, join_occurrence, reconfirm_activity, reconfirm_occurrence
from app.services.activity_suggestions import (
    accept_suggestion,
    create_occurrence_suggestion,
    create_suggestion,
    decline_suggestion,
    remove_support,
    support_suggestion,
    withdraw_suggestion,
)
from app.services.circle_members import activate_member
from tests.test_activities import ROOT, _create_payload

LATER = datetime(2026, 11, 3, 14, 0, tzinfo=timezone.utc)
LATER_END = datetime(2026, 11, 3, 16, 0, tzinfo=timezone.utc)


def _time(**overrides: object) -> ActivitySuggestionCreate:
    data: dict[str, object] = {"type": "time", "proposedStartAt": LATER, "proposedEndAt": LATER_END, "note": "Morning is difficult"}
    data.update(overrides)
    return ActivitySuggestionCreate.model_validate(data)


def _place(**overrides: object) -> ActivitySuggestionCreate:
    data: dict[str, object] = {"type": "location", "proposedLocationName": "Fluntern Tennis Courts", "proposedLocationAddress": "Zurich"}
    data.update(overrides)
    return ActivitySuggestionCreate.model_validate(data)


class ActivitySuggestionTests(unittest.IsolatedAsyncioTestCase):
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

    async def _plan(self, **overrides: object):
        created = await create_activity(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=_create_payload(**overrides)
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _weekly(self):
        return await self._plan(
            title="Saturday tennis",
            recurrenceType="recurring",
            recurrenceRule="Mon 18:00",
            locationName="Park courts",
        )

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

    async def _outsider(self) -> UUID:
        other = await self.conn.fetchval(
            """
            SELECT u.id
            FROM users u
            WHERE u.id <> $2
              AND u.id <> $3
              AND NOT EXISTS (
                SELECT 1 FROM circle_members m
                WHERE m.circle_id = $1 AND m.user_id = u.id AND m.status = 'active'
              )
            LIMIT 1
            """,
            self.circle_id,
            self.member_id,
            self.owner_id,
        )
        if other is None:
            self.skipTest("needs a non-member")
        return other

    def _one(self, activity, kind: str, occurrence_id: str | None = None, status: str = "open"):
        pool = activity.suggestions
        if occurrence_id is not None:
            pool = next(item.suggestions for item in activity.occurrences if item.id == occurrence_id)
        return next(item for item in pool if item.type == kind and item.status == status)

    async def test_time_suggestion_waits_for_acceptance(self) -> None:
        plan = await self._plan(title="Evening tennis", locationName="Park courts")
        before = plan.startAt
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        self.assertEqual(suggested.startAt, before)
        self.assertEqual(suggested.status, "open")
        item = self._one(suggested, "time")
        self.assertEqual(item.supportCount, 0)
        self.assertFalse(item.supportedByMe)
        with self.assertRaises(HTTPException) as duplicate:
            await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        self.assertEqual(duplicate.exception.status_code, 409)

    async def test_location_suggestion_waits_for_acceptance(self) -> None:
        plan = await self._plan(locationName="Park courts", locationAddress="Old street")
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_place())
        self.assertEqual(suggested.locationName, "Park courts")
        self.assertEqual(suggested.locationAddress, "Old street")
        self.assertEqual(self._one(suggested, "location").proposedLocationName, "Fluntern Tennis Courts")

    async def test_recurring_suggestion_targets_one_date(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        with self.assertRaises(HTTPException) as series:
            await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), payload=_time())
        self.assertEqual(series.exception.status_code, 400)
        suggested = await create_occurrence_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(first.id),
            payload=_time(),
        )
        self.assertEqual(suggested.suggestions, [])
        self.assertEqual(suggested.recurrenceRule, weekly.recurrenceRule)
        self.assertEqual(suggested.startAt, weekly.startAt)
        saved = self._one(suggested, "time", first.id)
        self.assertEqual(saved.occurrenceId, first.id)
        self.assertEqual(next(item.startAt for item in suggested.occurrences if item.id == second.id), second.startAt)
        self.assertEqual(next(item.suggestions for item in suggested.occurrences if item.id == second.id), [])

    async def test_attendance_alone_cannot_suggest_or_support(self) -> None:
        plan = await self._plan()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        item = self._one(suggested, "time")
        outsider = await self._outsider()
        session_id = uuid4()
        await self.conn.execute(
            """
            INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
            VALUES ($1, $2, $3, $4)
            """,
            session_id,
            self.circle_id,
            datetime(2026, 12, 1, 18, 0, tzinfo=timezone.utc),
            "court",
        )
        await self.conn.execute(
            """
            INSERT INTO attendance ("userId", "sessionId", status)
            VALUES ($1, $2, 'attending')
            """,
            outsider,
            session_id,
        )
        with self.assertRaises(HTTPException) as created:
            await create_suggestion(self.conn, user_id=outsider, activity_id=UUID(plan.id), payload=_place())
        self.assertEqual(created.exception.status_code, 403)
        with self.assertRaises(HTTPException) as supported:
            await support_suggestion(self.conn, user_id=outsider, suggestion_id=UUID(item.id))
        self.assertEqual(supported.exception.status_code, 403)
        fresh = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertEqual(fresh.startAt, plan.startAt)
        self.assertEqual(self._one(fresh, "time").supportCount, 0)

    async def test_two_supports_count_exactly_two(self) -> None:
        plan = await self._plan()
        other = await self._other()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        item_id = UUID(self._one(suggested, "time").id)
        self.assertFalse(self._one(suggested, "time").canSupport)
        with self.assertRaises(HTTPException) as own:
            await support_suggestion(self.conn, user_id=self.member_id, suggestion_id=item_id)
        self.assertEqual(own.exception.status_code, 403)
        once = await support_suggestion(self.conn, user_id=other, suggestion_id=item_id)
        self.assertEqual(self._one(once, "time").supportCount, 1)
        self.assertTrue(self._one(once, "time").supportedByMe)
        mine = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertFalse(self._one(mine, "time").canSupport)
        self.assertFalse(self._one(mine, "time").supportedByMe)
        second = await self.conn.fetchval(
            "SELECT id FROM users WHERE id <> $1 AND id <> $2 AND id <> $3 LIMIT 1",
            self.member_id,
            self.owner_id,
            other,
        )
        if second is None:
            self.skipTest("needs another user")
        await activate_member(self.conn, user_id=second, circle_id=self.circle_id)
        twice = await support_suggestion(self.conn, user_id=second, suggestion_id=item_id)
        self.assertEqual(self._one(twice, "time").supportCount, 2)
        self.assertTrue(self._one(twice, "time").supportedByMe)
        again = await support_suggestion(self.conn, user_id=second, suggestion_id=item_id)
        self.assertEqual(self._one(again, "time").supportCount, 2)
        removed = await remove_support(self.conn, user_id=other, suggestion_id=item_id)
        self.assertEqual(self._one(removed, "time").supportCount, 1)

    async def test_withdraw_blocks_support_and_acceptance(self) -> None:
        plan = await self._plan()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        item_id = UUID(self._one(suggested, "time").id)
        withdrawn = await withdraw_suggestion(self.conn, user_id=self.member_id, suggestion_id=item_id)
        self.assertEqual(self._one(withdrawn, "time", status="withdrawn").status, "withdrawn")
        self.assertEqual(withdrawn.startAt, plan.startAt)
        with self.assertRaises(HTTPException):
            await support_suggestion(self.conn, user_id=self.member_id, suggestion_id=item_id)
        with self.assertRaises(HTTPException):
            await accept_suggestion(self.conn, user_id=self.member_id, suggestion_id=item_id)
        fresh = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertEqual(fresh.startAt, plan.startAt)

    async def test_accept_time_updates_only_the_chosen_target(self) -> None:
        plan = await self._plan()
        peer = await self._other()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        self.assertFalse(self._one(suggested, "time").canDecide)
        accepted = await accept_suggestion(
            self.conn, user_id=peer, suggestion_id=UUID(self._one(suggested, "time").id)
        )
        self.assertEqual(accepted.startAt, LATER)
        self.assertEqual(accepted.endAt, LATER_END)
        self.assertEqual(accepted.status, "open")
        self.assertEqual(self._one(accepted, "time", status="accepted").status, "accepted")

        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        dated = await create_occurrence_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(first.id),
            payload=_time(),
        )
        moved = await accept_suggestion(
            self.conn, user_id=peer, suggestion_id=UUID(self._one(dated, "time", first.id).id)
        )
        changed = next(item for item in moved.occurrences if item.id == first.id)
        untouched = next(item for item in moved.occurrences if item.id == second.id)
        self.assertEqual(changed.startAt, LATER)
        self.assertEqual(changed.endAt, LATER_END)
        self.assertEqual(untouched.startAt, second.startAt)
        self.assertEqual(moved.startAt, weekly.startAt)
        self.assertEqual(moved.recurrenceRule, weekly.recurrenceRule)

    async def test_accept_location_overrides_only_the_chosen_date(self) -> None:
        plan = await self._plan(locationName="Park courts")
        peer = await self._other()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_place())
        accepted = await accept_suggestion(
            self.conn, user_id=peer, suggestion_id=UUID(self._one(suggested, "location").id)
        )
        self.assertEqual(accepted.locationName, "Fluntern Tennis Courts")
        self.assertEqual(accepted.locationAddress, "Zurich")

        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        dated = await create_occurrence_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(first.id),
            payload=_place(),
        )
        moved = await accept_suggestion(
            self.conn, user_id=peer, suggestion_id=UUID(self._one(dated, "location", first.id).id)
        )
        changed = next(item for item in moved.occurrences if item.id == first.id)
        untouched = next(item for item in moved.occurrences if item.id == second.id)
        self.assertEqual(changed.locationName, "Fluntern Tennis Courts")
        self.assertEqual(changed.locationAddress, "Zurich")
        self.assertIsNone(untouched.locationName)
        self.assertEqual(moved.locationName, "Park courts")

    async def test_one_open_suggestion_blocks_another_until_it_is_settled(self) -> None:
        plan = await self._plan()
        other = await self._other()
        first = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        item_id = UUID(self._one(first, "time").id)
        with self.assertRaises(HTTPException) as another_time:
            await create_suggestion(
                self.conn,
                user_id=other,
                activity_id=UUID(plan.id),
                payload=_time(proposedStartAt=LATER + timedelta(days=1), proposedEndAt=LATER_END + timedelta(days=1)),
            )
        self.assertEqual(another_time.exception.status_code, 409)
        with self.assertRaises(HTTPException) as another_place:
            await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_place())
        self.assertEqual(another_place.exception.status_code, 409)
        withdrawn = await withdraw_suggestion(self.conn, user_id=self.member_id, suggestion_id=item_id)
        self.assertEqual(self._one(withdrawn, "time", status="withdrawn").status, "withdrawn")
        placed = await create_suggestion(self.conn, user_id=other, activity_id=UUID(plan.id), payload=_place())
        self.assertEqual(self._one(placed, "location").proposedLocationName, "Fluntern Tennis Courts")

    async def test_ordinary_member_cannot_decide(self) -> None:
        plan = await self._plan()
        other = await self._other()
        suggested = await create_suggestion(self.conn, user_id=other, activity_id=UUID(plan.id), payload=_time())
        item_id = UUID(self._one(suggested, "time").id)
        self.assertFalse(self._one(suggested, "time").canDecide)
        seen = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertTrue(self._one(seen, "time").canDecide)
        with self.assertRaises(HTTPException) as accepted:
            await accept_suggestion(self.conn, user_id=other, suggestion_id=item_id)
        self.assertEqual(accepted.exception.status_code, 403)
        with self.assertRaises(HTTPException) as declined:
            await decline_suggestion(self.conn, user_id=other, suggestion_id=item_id)
        self.assertEqual(declined.exception.status_code, 403)
        fresh = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertEqual(fresh.startAt, plan.startAt)
        self.assertEqual(self._one(fresh, "time").status, "open")

    async def test_decline_changes_only_the_suggestion(self) -> None:
        plan = await self._plan(locationName="Park courts")
        peer = await self._other()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_place())
        with self.assertRaises(HTTPException) as own:
            await decline_suggestion(self.conn, user_id=self.member_id, suggestion_id=UUID(self._one(suggested, "location").id))
        self.assertEqual(own.exception.status_code, 403)
        declined = await decline_suggestion(
            self.conn, user_id=peer, suggestion_id=UUID(self._one(suggested, "location").id)
        )
        self.assertEqual(self._one(declined, "location", status="declined").status, "declined")
        self.assertEqual(declined.locationName, "Park courts")
        self.assertEqual(declined.startAt, plan.startAt)
        self.assertEqual(declined.status, "open")

    async def test_confirmed_plan_returns_to_open_and_asks_again(self) -> None:
        plan = await self._plan()
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        peer = await self._other()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        with self.assertRaises(HTTPException) as own:
            await accept_suggestion(self.conn, user_id=self.member_id, suggestion_id=UUID(self._one(suggested, "time").id))
        self.assertEqual(own.exception.status_code, 403)
        await accept_suggestion(self.conn, user_id=peer, suggestion_id=UUID(self._one(suggested, "time").id))
        accepted = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertEqual(accepted.status, "confirmed")
        self.assertFalse(accepted.actions.canConfirm)
        self.assertEqual(accepted.startAt, LATER)
        self.assertIsNotNone(accepted.participation)
        self.assertEqual(accepted.participation.goingCount, 1)
        self.assertEqual(accepted.participation.currentUserStatus, "going")
        self.assertTrue(accepted.participation.confirmationRequired)
        await self.conn.execute("UPDATE activities SET status = 'open' WHERE id = $1", UUID(plan.id))
        restored = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertEqual(restored.status, "confirmed")
        self.assertFalse(restored.actions.canConfirm)
        cleared = await reconfirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertFalse(cleared.participation.confirmationRequired)
        self.assertEqual(cleared.participation.currentUserStatus, "going")

    async def test_accepter_who_is_going_is_not_asked_again(self) -> None:
        plan = await self._plan()
        await join_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        peer = await self._other()
        await join_activity(self.conn, user_id=peer, activity_id=UUID(plan.id))
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        accepted = await accept_suggestion(self.conn, user_id=peer, suggestion_id=UUID(self._one(suggested, "time").id))
        self.assertEqual(accepted.participation.currentUserStatus, "going")
        self.assertFalse(accepted.participation.confirmationRequired)
        suggester = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertTrue(suggester.participation.confirmationRequired)
        await self.conn.execute(
            """
            UPDATE activity_participants
            SET confirmation_required = TRUE
            WHERE activity_id = $1 AND user_id = $2
            """,
            UUID(plan.id),
            peer,
        )
        again = await get_activity(self.conn, user_id=peer, activity_id=UUID(plan.id))
        self.assertFalse(again.participation.confirmationRequired)

    async def test_confirmed_date_reopens_only_that_date(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id))
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id))
        suggested = await create_occurrence_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(first.id),
            payload=_place(),
        )
        peer = await self._other()
        await accept_suggestion(
            self.conn, user_id=peer, suggestion_id=UUID(self._one(suggested, "location", first.id).id)
        )
        accepted = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        changed = next(item for item in accepted.occurrences if item.id == first.id)
        untouched = next(item for item in accepted.occurrences if item.id == second.id)
        self.assertEqual(changed.status, "confirmed")
        self.assertFalse(changed.actions.canConfirm)
        self.assertTrue(changed.participation.confirmationRequired)
        self.assertEqual(changed.participation.currentUserStatus, "going")
        self.assertEqual(untouched.status, "confirmed")
        self.assertFalse(untouched.participation.confirmationRequired)
        self.assertEqual(untouched.startAt, second.startAt)
        self.assertEqual(accepted.status, "open")
        await self.conn.execute(
            """
            UPDATE activity_occurrence_participants
            SET confirmation_required = TRUE
            WHERE occurrence_id = $1 AND user_id = $2
            """,
            UUID(second.id),
            self.member_id,
        )
        cleared = await reconfirm_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        again = next(item for item in cleared.occurrences if item.id == first.id)
        still = next(item for item in cleared.occurrences if item.id == second.id)
        self.assertFalse(again.participation.confirmationRequired)
        self.assertTrue(still.participation.confirmationRequired)
        self.assertEqual(still.status, "confirmed")

    async def test_cancelled_or_completed_plan_cannot_accept_a_suggestion(self) -> None:
        plan = await self._plan()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        item_id = UUID(self._one(suggested, "time").id)
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        with self.assertRaises(HTTPException) as cancelled:
            await accept_suggestion(self.conn, user_id=self.member_id, suggestion_id=item_id)
        self.assertEqual(cancelled.exception.status_code, 400)
        with self.assertRaises(HTTPException):
            await support_suggestion(self.conn, user_id=self.member_id, suggestion_id=item_id)
        fresh = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertEqual(fresh.status, "cancelled")
        self.assertEqual(fresh.startAt, plan.startAt)
        self.assertFalse(self._one(fresh, "time").actionable)

        finished = await self._plan()
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(finished.id))
        offered = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(finished.id), payload=_place())
        offer_id = UUID(self._one(offered, "location").id)
        await self.conn.execute(
            """
            UPDATE activities
            SET start_at = NOW() - INTERVAL '2 hours', end_at = NOW() - INTERVAL '1 hour'
            WHERE id = $1
            """,
            UUID(finished.id),
        )
        await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(finished.id))
        with self.assertRaises(HTTPException) as completed:
            await accept_suggestion(self.conn, user_id=self.member_id, suggestion_id=offer_id)
        self.assertIn(completed.exception.status_code, (400, 409))
        done = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(finished.id))
        self.assertEqual(done.status, "completed")
        self.assertNotEqual(done.locationName, "Fluntern Tennis Courts")

    async def test_two_accepts_cannot_both_win(self) -> None:
        url = os.environ["DATABASE_URL"]
        outside = await asyncpg.connect(url)
        activity_id: UUID | None = None
        peer: UUID | None = None
        try:
            created = await create_activity(
                outside, user_id=self.member_id, circle_id=self.circle_id, payload=_create_payload(title="Race plan")
            )
            activity_id = UUID(created.id)
            await publish_activity(outside, user_id=self.member_id, activity_id=activity_id)
            suggested = await create_suggestion(outside, user_id=self.member_id, activity_id=activity_id, payload=_time())
            suggestion_id = UUID(suggested.suggestions[0].id)
            peer = await outside.fetchval(
                """
                SELECT id FROM users
                WHERE id <> $1
                  AND NOT EXISTS (
                    SELECT 1 FROM circle_members
                    WHERE circle_id = $2 AND user_id = users.id
                  )
                LIMIT 1
                """,
                self.member_id,
                self.circle_id,
            )
            if peer is None:
                self.skipTest("needs another user")
            await activate_member(outside, user_id=peer, circle_id=self.circle_id)

            async def attempt() -> int | None:
                conn = await asyncpg.connect(url)
                try:
                    await accept_suggestion(conn, user_id=peer, suggestion_id=suggestion_id)
                    return None
                except HTTPException as exc:
                    return exc.status_code
                finally:
                    await conn.close()

            codes = await asyncio.gather(attempt(), attempt())
            self.assertCountEqual(codes, [None, 409])
            saved = await outside.fetchrow("SELECT start_at, status FROM activities WHERE id = $1", activity_id)
            self.assertEqual(saved["start_at"], LATER)
            self.assertEqual(saved["status"], "open")
            accepted = await outside.fetchval(
                """
                SELECT COUNT(*)::int FROM activity_suggestions
                WHERE activity_id = $1 AND status = 'accepted'
                """,
                activity_id,
            )
            self.assertEqual(int(accepted), 1)
        finally:
            if activity_id is not None:
                await outside.execute("DELETE FROM activities WHERE id = $1", activity_id)
            if peer is not None:
                await outside.execute(
                    "DELETE FROM circle_members WHERE circle_id = $1 AND user_id = $2",
                    self.circle_id,
                    peer,
                )
            await outside.close()

    async def test_suggestions_do_not_touch_legacy_rows(self) -> None:
        before = await self._counts()
        plan = await self._plan()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        item_id = UUID(self._one(suggested, "time").id)
        peer = await self._other()
        await support_suggestion(self.conn, user_id=peer, suggestion_id=item_id)
        await remove_support(self.conn, user_id=peer, suggestion_id=item_id)
        await support_suggestion(self.conn, user_id=peer, suggestion_id=item_id)
        await decline_suggestion(self.conn, user_id=peer, suggestion_id=item_id)
        again = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_place())
        await accept_suggestion(self.conn, user_id=peer, suggestion_id=UUID(self._one(again, "location").id))
        self.assertEqual(await self._counts(), before)

    async def test_support_does_not_change_the_plan(self) -> None:
        plan = await self._plan(locationName="Park courts")
        other = await self._other()
        suggested = await create_suggestion(self.conn, user_id=self.member_id, activity_id=UUID(plan.id), payload=_time())
        item_id = UUID(self._one(suggested, "time").id)
        await support_suggestion(self.conn, user_id=other, suggestion_id=item_id)
        with self.assertRaises(HTTPException) as own:
            await support_suggestion(self.conn, user_id=self.member_id, suggestion_id=item_id)
        self.assertEqual(own.exception.status_code, 403)
        fresh = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(plan.id))
        self.assertEqual(fresh.startAt, plan.startAt)
        self.assertEqual(fresh.locationName, "Park courts")
        self.assertEqual(fresh.status, "open")
        self.assertEqual(self._one(fresh, "time").supportCount, 1)
        self.assertEqual(self._one(fresh, "time").status, "open")

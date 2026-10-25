"""Recurring dates are upcoming until they end, then past; the whole series can be cancelled. Rolls back."""

from __future__ import annotations

import unittest
from datetime import timedelta
from uuid import UUID

from fastapi import HTTPException

from app.schemas import ActivitySuggestionCreate
from app.services.activities_service import (
    cancel_activity,
    complete_activity,
    confirm_activity,
    create_activity,
    ensure_future_activity_occurrences,
    get_activity,
    list_activities_for_circle,
    publish_activity,
)
from app.services.activity_participants import join_occurrence, leave_occurrence, reconfirm_occurrence
from app.services.activity_suggestions import (
    accept_suggestion,
    create_occurrence_suggestion,
    remove_support,
    support_suggestion,
)
from app.services.circle_members import activate_member
from tests.test_activities import _create_payload
from tests.test_activity_recurrence import RecurringDbCase


def _time(start) -> ActivitySuggestionCreate:
    return ActivitySuggestionCreate.model_validate(
        {"type": "time", "proposedStartAt": start, "proposedEndAt": start + timedelta(hours=2)}
    )


class RecurringLifecycleTests(RecurringDbCase):
    async def _date(self, activity_id: str, occurrence_id: str):
        loaded = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(activity_id))
        return next(item for item in loaded.occurrences if item.id == occurrence_id)

    async def _status(self, occurrence_id: str) -> str:
        return await self.conn.fetchval("SELECT status FROM activity_occurrences WHERE id = $1", UUID(occurrence_id))

    async def _other(self) -> UUID:
        circle_owner = await self.conn.fetchval("SELECT created_by FROM circles WHERE id = $1", self.circle_id)
        other = await self.conn.fetchval(
            "SELECT id FROM users WHERE id <> $1 AND id <> $2 LIMIT 1",
            self.member_id,
            circle_owner,
        )
        if other is None:
            self.skipTest("needs another user")
        await activate_member(self.conn, user_id=other, circle_id=self.circle_id)
        return other

    async def _history(self, activity_id: str) -> tuple[list[dict], list[dict], list[dict]]:
        people = await self.conn.fetch(
            """
            SELECT p.* FROM activity_occurrence_participants p
            JOIN activity_occurrences o ON o.id = p.occurrence_id
            WHERE o.activity_id = $1 ORDER BY p.id
            """,
            UUID(activity_id),
        )
        suggestions = await self.conn.fetch(
            "SELECT * FROM activity_suggestions WHERE activity_id = $1 ORDER BY id", UUID(activity_id)
        )
        support = await self.conn.fetch(
            """
            SELECT sup.* FROM activity_suggestion_support sup
            JOIN activity_suggestions s ON s.id = sup.suggestion_id
            WHERE s.activity_id = $1 ORDER BY sup.id
            """,
            UUID(activity_id),
        )
        return [dict(r) for r in people], [dict(r) for r in suggestions], [dict(r) for r in support]

    async def test_a_future_open_date_is_joinable_without_confirmation(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        self.assertEqual(first.status, "open")
        self.assertTrue(first.actions.canJoin)
        self.assertFalse(first.actions.canConfirm)
        joined = await join_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )
        saved = next(item for item in joined.occurrences if item.id == first.id)
        self.assertEqual(saved.participation.currentUserStatus, "going")
        self.assertEqual(saved.status, "open")
        self.assertTrue(saved.actions.canLeave)

    async def test_b_open_date_becomes_past_after_it_ends(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await self._weeks_pass(weekly.id, 1)
        past = await self._date(weekly.id, first.id)
        self.assertTrue(past.hasEnded)
        self.assertEqual(past.status, "open")
        self.assertEqual(past.participation.currentUserStatus, "going")
        for flag in ("canJoin", "canLeave", "canCancel", "canSuggest", "canConfirm", "canComplete"):
            self.assertFalse(getattr(past.actions, flag), flag)
        with self.assertRaises(HTTPException) as join_late:
            await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        self.assertEqual(join_late.exception.status_code, 400)
        with self.assertRaises(HTTPException) as leave_late:
            await leave_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        self.assertEqual(leave_late.exception.status_code, 400)
        self.assertEqual(await self._status(first.id), "open")

    async def test_c_no_date_or_series_needs_confirm_or_complete(self) -> None:
        weekly = await self._weekly()
        self.assertFalse(weekly.actions.canConfirm)
        self.assertFalse(weekly.actions.canComplete)
        self.assertTrue(weekly.actions.canCancel)
        for item in weekly.occurrences:
            self.assertFalse(item.actions.canConfirm)
            self.assertFalse(item.actions.canComplete)
        await self._weeks_pass(weekly.id, 2)
        loaded = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        past = [item for item in loaded.occurrences if item.hasEnded]
        self.assertEqual(len(past), 2)
        for item in past:
            self.assertEqual(item.status, "open")
            self.assertFalse(item.actions.canComplete)
        self.assertEqual(loaded.status, "open")

    async def test_d_not_happening_changes_only_that_date(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id))
        before = await self._history(weekly.id)
        updated = await cancel_activity(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(second.id),
            reason="Courts closed",
        )
        self.assertEqual(updated.status, "open")
        self.assertEqual(updated.recurrenceRule, weekly.recurrenceRule)
        by_id = {item.id: item for item in updated.occurrences}
        self.assertEqual(by_id[second.id].status, "cancelled")
        self.assertEqual(by_id[second.id].cancellationReason, "Courts closed")
        self.assertFalse(by_id[second.id].actions.canJoin)
        others = [item for item in updated.occurrences if item.id != second.id]
        self.assertTrue(all(item.status == "open" for item in others))
        self.assertTrue(by_id[first.id].actions.canJoin)
        self.assertEqual(await self._history(weekly.id), before)

    async def test_e_ended_date_cannot_be_marked_not_happening(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await self._weeks_pass(weekly.id, 1)
        with self.assertRaises(HTTPException) as rejected:
            await cancel_activity(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
            )
        self.assertEqual(rejected.exception.status_code, 400)
        self.assertEqual(rejected.exception.detail, "This date has already happened.")
        self.assertEqual(await self._status(first.id), "open")

    async def test_f_cancel_the_whole_recurring_activity(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await self._weeks_pass(weekly.id, 1)
        cancelled = await cancel_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), reason="Season over"
        )
        self.assertEqual(cancelled.status, "cancelled")
        self.assertEqual(cancelled.cancellationReason, "Season over")
        self.assertFalse(cancelled.actions.canCancel)
        by_id = {item.id: item for item in cancelled.occurrences}
        self.assertEqual(by_id[first.id].status, "open")
        self.assertTrue(by_id[first.id].hasEnded)
        future = [item for item in cancelled.occurrences if not item.hasEnded]
        self.assertEqual(len(future), len(weekly.occurrences) - 1)
        for item in future:
            self.assertEqual(item.status, "cancelled")
            self.assertEqual(item.cancellationReason, "Season over")
        for item in cancelled.occurrences:
            self.assertFalse(item.actions.canJoin)
            self.assertFalse(item.actions.canCancel)
            self.assertFalse(item.actions.canSuggest)
        with self.assertRaises(HTTPException) as join_after:
            await join_occurrence(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(future[0].id)
            )
        self.assertEqual(join_after.exception.status_code, 400)
        with self.assertRaises(HTTPException) as again:
            await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(again.exception.status_code, 400)

    async def test_f_only_creator_or_owner_can_cancel_the_series(self) -> None:
        weekly = await self._weekly()
        other = await self._other()
        with self.assertRaises(HTTPException) as denied:
            await cancel_activity(self.conn, user_id=other, activity_id=UUID(weekly.id))
        self.assertEqual(denied.exception.status_code, 403)
        status = await self.conn.fetchval("SELECT status FROM activities WHERE id = $1", UUID(weekly.id))
        self.assertEqual(status, "open")

    async def test_g_series_cancel_keeps_every_participant_row(self) -> None:
        weekly = await self._weekly()
        dates = weekly.occurrences
        for item in dates[:3]:
            await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(item.id))
        await leave_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(dates[2].id))
        await self._weeks_pass(weekly.id, 1)
        people_before, _, _ = await self._history(weekly.id)
        self.assertEqual(len(people_before), 3)
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        people_after, _, _ = await self._history(weekly.id)
        self.assertEqual(people_after, people_before)

    async def test_h_series_cancel_keeps_suggestions_and_blocks_new_ones(self) -> None:
        weekly = await self._weekly()
        target = weekly.occurrences[2]
        suggested = await create_occurrence_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(target.id),
            payload=_time(target.startAt + timedelta(hours=3)),
        )
        suggestion_id = self._occurrence_suggestion_id(suggested, target.id, "time")
        await support_suggestion(self.conn, user_id=self.member_id, suggestion_id=suggestion_id)
        before = await self._history(weekly.id)
        cancelled = await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(await self._history(weekly.id), before)
        kept = next(item for item in cancelled.occurrences if item.id == target.id)
        self.assertEqual(len(kept.suggestions), 1)
        self.assertEqual(kept.suggestions[0].status, "open")
        self.assertFalse(kept.suggestions[0].actionable)
        self.assertFalse(kept.suggestions[0].canDecide)
        attempts = (
            lambda: create_occurrence_suggestion(
                self.conn,
                user_id=self.member_id,
                activity_id=UUID(weekly.id),
                occurrence_id=UUID(target.id),
                payload=_time(target.startAt + timedelta(hours=5)),
            ),
            lambda: support_suggestion(self.conn, user_id=self.member_id, suggestion_id=suggestion_id),
            lambda: remove_support(self.conn, user_id=self.member_id, suggestion_id=suggestion_id),
            lambda: accept_suggestion(self.conn, user_id=self.member_id, suggestion_id=suggestion_id),
        )
        for attempt in attempts:
            with self.assertRaises(HTTPException) as refused:
                await attempt()
            self.assertEqual(refused.exception.status_code, 400)
        self.assertEqual(await self._history(weekly.id), before)

    async def test_h_started_date_blocks_suggestions_after_series_cancel(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET start_at = NOW() - INTERVAL '30 minutes', end_at = NOW() + INTERVAL '2 hours'
            WHERE id = $1
            """,
            UUID(first.id),
        )
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(await self._status(first.id), "open")
        started = await self._date(weekly.id, first.id)
        self.assertFalse(started.actions.canJoin)
        self.assertFalse(started.actions.canSuggest)
        with self.assertRaises(HTTPException) as refused:
            await create_occurrence_suggestion(
                self.conn,
                user_id=self.member_id,
                activity_id=UUID(weekly.id),
                occurrence_id=UUID(first.id),
                payload=_time(first.startAt + timedelta(days=1)),
            )
        self.assertEqual(refused.exception.status_code, 400)

    async def test_i_cancelled_series_never_gets_new_dates(self) -> None:
        weekly = await self._weekly()
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        count = len(await self._rows(weekly.id))
        await self._weeks_pass(weekly.id, 4)
        self.assertEqual(await ensure_future_activity_occurrences(self.conn, UUID(weekly.id)), 0)
        await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        self.assertEqual(len(await self._rows(weekly.id)), count)

    async def test_j_confirmed_date_keeps_working_and_becomes_past(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id))
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id))
        live = await self._date(weekly.id, second.id)
        self.assertEqual(live.status, "confirmed")
        self.assertTrue(live.actions.canLeave)
        suggested = await create_occurrence_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(second.id),
            payload=_time(second.startAt + timedelta(hours=1)),
        )
        moved = await accept_suggestion(
            self.conn,
            user_id=self.member_id,
            suggestion_id=self._occurrence_suggestion_id(suggested, second.id, "time"),
        )
        changed = next(item for item in moved.occurrences if item.id == second.id)
        self.assertEqual(changed.status, "open")
        self.assertTrue(changed.participation.confirmationRequired)
        confirmed_again = await reconfirm_occurrence(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id)
        )
        again = next(item for item in confirmed_again.occurrences if item.id == second.id)
        self.assertFalse(again.participation.confirmationRequired)
        await self._weeks_pass(weekly.id, 1)
        past = await self._date(weekly.id, first.id)
        self.assertEqual(past.status, "confirmed")
        self.assertTrue(past.hasEnded)
        self.assertFalse(past.actions.canJoin)
        self.assertFalse(past.actions.canComplete)
        self.assertFalse(past.actions.canCancel)

    async def test_k_completed_date_stays_completed_and_read_only(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await self._weeks_pass(weekly.id, 1)
        await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        done = await self._date(weekly.id, first.id)
        self.assertEqual(done.status, "completed")
        self.assertEqual(done.participation.goingCount, 1)
        for flag in ("canJoin", "canLeave", "canCancel", "canSuggest", "canComplete"):
            self.assertFalse(getattr(done.actions, flag), flag)
        with self.assertRaises(HTTPException):
            await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(await self._status(first.id), "completed")

    async def test_l_one_time_lifecycle_is_unchanged(self) -> None:
        created = await create_activity(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=_create_payload(title="Once")
        )
        opened = await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        self.assertEqual(opened.status, "open")
        self.assertTrue(opened.actions.canConfirm)
        self.assertEqual(opened.occurrences, [])
        with self.assertRaises(HTTPException):
            await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        with self.assertRaises(HTTPException) as one_date:
            await cancel_activity(
                self.conn, user_id=self.member_id, activity_id=UUID(created.id), occurrence_id=UUID(created.id)
            )
        self.assertEqual(one_date.exception.status_code, 400)
        confirmed = await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        self.assertEqual(confirmed.status, "confirmed")
        with self.assertRaises(HTTPException):
            await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        await self.conn.execute(
            "UPDATE activities SET start_at = NOW() - INTERVAL '2 hours', end_at = NOW() - INTERVAL '1 hour' WHERE id = $1",
            UUID(created.id),
        )
        done = await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        self.assertEqual(done.status, "completed")
        self.assertEqual(len(await self._rows(created.id)), 0)

    async def test_m_lifecycle_leaves_legacy_rows_alone(self) -> None:
        before = await self._counts()
        weekly = await self._weekly()
        dates = weekly.occurrences
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(dates[1].id))
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(dates[2].id))
        await self._weeks_pass(weekly.id, 1)
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(await self._counts(), before)


if __name__ == "__main__":
    unittest.main()

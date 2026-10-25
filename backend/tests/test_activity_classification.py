"""Next usable recurring date drives circle-list classification. Database checks roll back."""

from __future__ import annotations

import unittest
from datetime import timedelta
from uuid import UUID

from app.services.activities_service import (
    cancel_activity,
    create_activity,
    ensure_future_activity_occurrences,
    get_activity,
    list_activities_for_circle,
    publish_activity,
)
from app.services.activity_participants import join_occurrence
from app.services.circle_members import activate_member
from tests.test_activities import _create_payload
from tests.test_activity_recurrence import ROLLING_DATES, RecurringDbCase


class RecurringClassificationTests(RecurringDbCase):
    async def _open(self, **overrides: object):
        created = await create_activity(
            self.conn,
            user_id=self.member_id,
            circle_id=self.circle_id,
            payload=_create_payload(**overrides),
        )
        return await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))

    async def _listed(self, activity_id: str):
        rows = await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        return next(item for item in rows if item.id == activity_id)

    async def _counts(self) -> tuple[int, int]:
        sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        return int(sessions), int(attendance)

    async def test_a_first_date_past_uses_the_next_open_date(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[:2]
        await self._weeks_pass(weekly.id, 1)

        listed = await self._listed(weekly.id)
        self.assertTrue(next(item for item in listed.occurrences if item.id == first.id).hasEnded)
        self.assertIsNotNone(listed.nextOccurrence)
        self.assertEqual(listed.nextOccurrence.id, second.id)
        self.assertFalse(listed.hasEnded)

    async def test_b_cancelled_future_date_is_skipped(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[:2]
        await cancel_activity(
            self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id)
        )

        listed = await self._listed(weekly.id)
        self.assertEqual(listed.nextOccurrence.id, second.id)
        self.assertEqual(next(item for item in listed.occurrences if item.id == first.id).status, "cancelled")

    async def test_c_past_dates_do_not_count_when_a_future_date_exists(self) -> None:
        weekly = await self._weekly()
        third = weekly.occurrences[2]
        await self._weeks_pass(weekly.id, 2)

        listed = await self._listed(weekly.id)
        self.assertEqual(listed.nextOccurrence.id, third.id)
        self.assertEqual(sum(item.hasEnded for item in listed.occurrences), 2)

    async def test_d_top_up_runs_before_next_date_classification(self) -> None:
        weekly = await self._weekly()
        await self._weeks_pass(weekly.id, ROLLING_DATES)

        listed = await self._listed(weekly.id)
        self.assertIsNotNone(listed.nextOccurrence)
        self.assertFalse(listed.nextOccurrence.hasEnded)
        self.assertEqual(listed.nextOccurrence.status, "open")
        usable = [
            item
            for item in listed.occurrences
            if item.status in ("open", "confirmed") and not item.hasEnded
        ]
        self.assertEqual(len(usable), ROLLING_DATES)

    async def test_e_cancelled_series_has_no_next_date(self) -> None:
        weekly = await self._weekly()
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))

        listed = await self._listed(weekly.id)
        self.assertEqual(listed.status, "cancelled")
        self.assertIsNone(listed.nextOccurrence)

    async def test_f_completed_recurring_parent_is_terminal_and_not_topped_up(self) -> None:
        weekly = await self._weekly()
        await self.conn.execute("UPDATE activities SET status = 'completed' WHERE id = $1", UUID(weekly.id))
        await self._weeks_pass(weekly.id, ROLLING_DATES)
        before = len(await self._rows(weekly.id))

        listed = await self._listed(weekly.id)
        self.assertEqual(listed.status, "completed")
        self.assertIsNone(listed.nextOccurrence)
        self.assertEqual(await ensure_future_activity_occurrences(self.conn, UUID(weekly.id)), 0)
        self.assertEqual(len(await self._rows(weekly.id)), before)

    async def test_g_next_date_uses_its_location_override(self) -> None:
        weekly = await self._weekly(locationName="Original courts", locationAddress="Old road")
        first = weekly.occurrences[0]
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET location_name_override = 'Indoor hall', location_address_override = 'Main St 4'
            WHERE id = $1
            """,
            UUID(first.id),
        )

        listed = await self._listed(weekly.id)
        self.assertEqual(listed.nextOccurrence.id, first.id)
        self.assertEqual(listed.nextOccurrence.locationName, "Indoor hall")
        self.assertEqual(listed.nextOccurrence.locationAddress, "Main St 4")

    async def test_h_next_date_uses_only_its_own_participation_count(self) -> None:
        weekly = await self._weekly()
        first, second = weekly.occurrences[:2]
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        # The second date has a different count. It must not be aggregated into the first date's card summary.
        other = await self.conn.fetchval("SELECT id FROM users WHERE id <> $1 LIMIT 1", self.member_id)
        if other is None:
            self.skipTest("needs another user")
        await activate_member(self.conn, user_id=other, circle_id=self.circle_id)
        await join_occurrence(self.conn, user_id=other, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id))

        listed = await self._listed(weekly.id)
        self.assertEqual(listed.nextOccurrence.id, first.id)
        self.assertEqual(listed.nextOccurrence.participation.goingCount, 1)
        self.assertNotEqual(listed.nextOccurrence.participation.goingCount, 2)

    async def test_i_one_time_response_still_has_no_synthetic_next_date(self) -> None:
        created = await self._open(title="Coffee")
        listed = await self._listed(created.id)
        self.assertEqual(listed.recurrenceType, "one_time")
        self.assertIsNone(listed.nextOccurrence)
        self.assertEqual(listed.startAt, created.startAt)

    async def test_j_next_dates_expose_actual_mixed_sort_moments(self) -> None:
        weekly = await self._weekly()
        one_time = await self._open(title="Coffee")
        await self.conn.execute(
            "UPDATE activities SET start_at = NOW() + INTERVAL '1 day' WHERE id = $1",
            UUID(one_time.id),
        )
        await self.conn.execute(
            "UPDATE activity_occurrences SET start_at = NOW() + INTERVAL '2 days', scheduled_at = NOW() + INTERVAL '2 days' WHERE id = $1",
            UUID(weekly.occurrences[0].id),
        )

        listed_weekly = await self._listed(weekly.id)
        listed_one_time = await self._listed(one_time.id)
        self.assertGreater(listed_weekly.nextOccurrence.startAt, listed_one_time.startAt)

    async def test_k_all_cancelled_dates_are_replaced_by_later_usable_dates(self) -> None:
        weekly = await self._weekly()
        for item in weekly.occurrences:
            await cancel_activity(
                self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(item.id)
            )

        listed = await self._listed(weekly.id)
        self.assertIsNotNone(listed.nextOccurrence)
        self.assertEqual(listed.nextOccurrence.status, "open")
        self.assertGreater(listed.nextOccurrence.startAt, weekly.occurrences[-1].startAt)

    async def test_l_listing_classification_does_not_touch_legacy_rows(self) -> None:
        before = await self._counts()
        weekly = await self._weekly()
        await self._weeks_pass(weekly.id, 2)
        await self._listed(weekly.id)
        await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(await self._counts(), before)


if __name__ == "__main__":
    unittest.main()

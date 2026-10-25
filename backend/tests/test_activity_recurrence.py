"""Rolling weekly dates for recurring activities. Database checks roll back and do not keep rows."""

from __future__ import annotations

import asyncio
import math
import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID

import asyncpg
from dotenv import load_dotenv
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas import ActivityCreateRequest, ActivitySuggestionCreate
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
from app.services.activity_participants import join_occurrence
from app.services.activity_recurrence import (
    ROLLING_DATES,
    parse_weekly_rule,
    recurring_occurrence_times,
    rule_matches_start,
    rule_offset,
)
from app.services.activity_rules import prepare_activity_fields
from tests.test_activities import ROOT, _create_payload

# A zone with daylight saving, so a shift across a clock change would show up as a wrong UTC hour.
SESSION_ZONE = "Europe/Zurich"


def _next_saturday_ten() -> datetime:
    now = datetime.now(timezone.utc)
    moment = now.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=(5 - now.weekday()) % 7)
    if moment <= now + timedelta(days=1):
        moment += timedelta(weeks=1)
    return moment


def _fields(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "title": "Saturday tennis",
        "description": None,
        "start_at": _next_saturday_ten(),
        "end_at": None,
        "recurrence_type": "recurring",
        "recurrence_rule": "Sat 10:00",
        "location_name": None,
        "location_address": None,
        "group_size": 4,
        "payment_type": "free",
        "price_amount": None,
        "currency": None,
        "status": "draft",
        "require_group_size": True,
    }
    data.update(overrides)
    return data


class WeeklyRuleTests(unittest.TestCase):
    def test_rule_is_read_as_day_and_time(self) -> None:
        self.assertEqual(parse_weekly_rule("Sat 10:00"), (5, 600))
        self.assertEqual(parse_weekly_rule(" Mon 7:30 "), (0, 450))
        self.assertIsNone(parse_weekly_rule("Weekly"))
        self.assertIsNone(parse_weekly_rule("Sat 25:00"))
        self.assertIsNone(parse_weekly_rule(None))

    def test_first_date_must_match_the_rule_at_a_real_offset(self) -> None:
        utc_saturday = datetime(2026, 10, 31, 10, 0, tzinfo=timezone.utc)
        self.assertEqual(rule_offset("Sat 10:00", utc_saturday), timedelta(0))
        israel_saturday = datetime(2026, 10, 31, 7, 0, tzinfo=timezone.utc)
        self.assertEqual(rule_offset("Sat 10:00", israel_saturday), timedelta(hours=3))
        late_friday_utc = datetime(2026, 10, 30, 22, 0, tzinfo=timezone.utc)
        self.assertEqual(rule_offset("Sat 01:00", late_friday_utc), timedelta(hours=3))
        monday = datetime(2026, 11, 2, 18, 0, tzinfo=timezone.utc)
        self.assertFalse(rule_matches_start("Sat 10:00", monday))

    def test_validation_rejects_a_rule_that_disagrees_with_the_first_date(self) -> None:
        prepare_activity_fields(**_fields())
        with self.assertRaises(ValueError):
            prepare_activity_fields(**_fields(recurrence_rule="Sun 10:00"))
        with self.assertRaises(ValueError):
            prepare_activity_fields(**_fields(recurrence_rule="every week"))

    def test_generated_dates_are_saturdays_at_ten_utc(self) -> None:
        start = datetime(2026, 10, 31, 10, 0, tzinfo=timezone.utc)
        times = recurring_occurrence_times(first_slot=start, duration=timedelta(hours=2), after=None, count=6)
        self.assertEqual(len(times), 6)
        for index, (begin, finish) in enumerate(times):
            self.assertEqual(begin.weekday(), 5)
            self.assertEqual((begin.hour, begin.minute), (10, 0))
            self.assertEqual(finish - begin, timedelta(hours=2))
            if index:
                self.assertEqual(begin - times[index - 1][0], timedelta(hours=168))
        self.assertEqual(len({begin for begin, _ in times}), 6)

    def test_utc_time_stays_fixed_across_daylight_saving(self) -> None:
        # Europe/Zurich leaves summer time on Sun 25 Oct 2026 (UTC+2 -> UTC+1).
        # Sat 17 Oct 10:00 UTC is 12:00 in Zurich; after the change the same UTC time is 11:00 there.
        first = datetime(2026, 10, 17, 10, 0, tzinfo=timezone.utc)
        begins = [begin for begin, _ in recurring_occurrence_times(first_slot=first, duration=None, after=None, count=3)]
        self.assertEqual(
            begins,
            [
                datetime(2026, 10, 17, 10, 0, tzinfo=timezone.utc),
                datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
                datetime(2026, 10, 31, 10, 0, tzinfo=timezone.utc),
            ],
        )
        summer, winter = timedelta(hours=2), timedelta(hours=1)
        self.assertEqual((begins[1] + summer).hour, 12)
        self.assertEqual((begins[2] + winter).hour, 11)

    def test_dates_continue_strictly_after_a_moment(self) -> None:
        start = datetime(2026, 10, 31, 10, 0, tzinfo=timezone.utc)
        after_exact = recurring_occurrence_times(first_slot=start, duration=None, after=start + timedelta(weeks=5), count=2)
        self.assertEqual(
            [begin for begin, _ in after_exact],
            [datetime(2026, 12, 12, 10, 0, tzinfo=timezone.utc), datetime(2026, 12, 19, 10, 0, tzinfo=timezone.utc)],
        )
        mid_week = recurring_occurrence_times(first_slot=start, duration=None, after=start + timedelta(days=9), count=1)
        self.assertEqual(mid_week[0][0], datetime(2026, 11, 14, 10, 0, tzinfo=timezone.utc))
        before = recurring_occurrence_times(first_slot=start, duration=None, after=start - timedelta(days=3), count=1)
        self.assertEqual(before[0], (start, None))


class RecurringDbCase(unittest.IsolatedAsyncioTestCase):
    """Shared database setup for recurring activity tests. Each test rolls back."""

    async def asyncSetUp(self) -> None:
        load_dotenv(ROOT / "backend" / ".env")
        url = os.getenv("DATABASE_URL")
        if not url:
            self.skipTest("DATABASE_URL missing")
        try:
            self.conn = await asyncpg.connect(url)
        except Exception as exc:
            self.skipTest(f"database unavailable: {exc.__class__.__name__}")
        await self.conn.execute(f"SET TIME ZONE '{SESSION_ZONE}'")
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

    async def asyncTearDown(self) -> None:
        tx = getattr(self, "tx", None)
        conn = getattr(self, "conn", None)
        if tx is not None:
            await tx.rollback()
        if conn is not None:
            await conn.close()

    async def _weekly(self, conn: asyncpg.Connection | None = None, **overrides: object):
        db = conn or self.conn
        payload = _create_payload(
            title="Saturday tennis",
            startAt=_next_saturday_ten(),
            recurrenceType="recurring",
            recurrenceRule="Sat 10:00",
            **overrides,
        )
        created = await create_activity(db, user_id=self.member_id, circle_id=self.circle_id, payload=payload)
        return await publish_activity(db, user_id=self.member_id, activity_id=UUID(created.id))

    async def _rows(self, activity_id: str, conn: asyncpg.Connection | None = None) -> list[asyncpg.Record]:
        db = conn or self.conn
        return list(
            await db.fetch(
                "SELECT * FROM activity_occurrences WHERE activity_id = $1 ORDER BY scheduled_at",
                UUID(activity_id),
            )
        )

    async def _ahead(self, activity_id: str) -> int:
        value = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_occurrences WHERE activity_id = $1 AND scheduled_at > NOW()",
            UUID(activity_id),
        )
        return int(value)

    async def _weeks_pass(self, activity_id: str, passed: int, conn: asyncpg.Connection | None = None) -> None:
        """Move the whole series back by whole weeks until exactly `passed` stored dates are in the past."""
        db = conn or self.conn
        slots = [row["scheduled_at"] for row in await self._rows(activity_id, db)]
        weeks = math.ceil((slots[passed - 1] - datetime.now(timezone.utc)) / timedelta(weeks=1))
        if weeks <= 0:
            return
        # Exact seconds: a "days" interval would follow the session's daylight-saving clock.
        shift = timedelta(weeks=weeks).total_seconds()
        await db.execute(
            """
            UPDATE activities
            SET start_at = start_at - make_interval(secs => $2::float8),
                end_at = end_at - make_interval(secs => $2::float8)
            WHERE id = $1
            """,
            UUID(activity_id),
            shift,
        )
        far = timedelta(days=36500).total_seconds()
        for step in (shift + far, -far):
            await db.execute(
                """
                UPDATE activity_occurrences
                SET start_at = start_at - make_interval(secs => $2::float8),
                    end_at = end_at - make_interval(secs => $2::float8),
                    scheduled_at = scheduled_at - make_interval(secs => $2::float8)
                WHERE activity_id = $1
                """,
                UUID(activity_id),
                step,
            )

    async def _counts(self) -> tuple[int, int]:
        sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        return int(sessions), int(attendance)

    def _occurrence_suggestion_id(self, activity, occurrence_id: str, kind: str) -> UUID:
        item = next(entry for entry in activity.occurrences if entry.id == occurrence_id)
        return UUID(next(s.id for s in item.suggestions if s.type == kind and s.status == "open"))


class RollingDateTests(RecurringDbCase):
    async def test_a_publish_creates_the_initial_dates(self) -> None:
        weekly = await self._weekly()
        rows = await self._rows(weekly.id)
        self.assertEqual(len(rows), ROLLING_DATES)
        self.assertEqual(rows[0]["start_at"], weekly.startAt)
        for row in rows:
            self.assertEqual(row["scheduled_at"], row["start_at"])
            self.assertEqual(row["status"], "open")
        self.assertEqual(len(weekly.occurrences), ROLLING_DATES)

    async def test_b_dates_are_saturdays_at_ten(self) -> None:
        weekly = await self._weekly()
        rows = await self._rows(weekly.id)
        for index, row in enumerate(rows):
            moment = row["start_at"].astimezone(timezone.utc)
            self.assertEqual(moment.weekday(), 5)
            self.assertEqual((moment.hour, moment.minute), (10, 0))
            if index:
                self.assertEqual(row["start_at"] - rows[index - 1]["start_at"], timedelta(weeks=1))

    async def test_c_top_up_restores_six_future_dates(self) -> None:
        weekly = await self._weekly()
        await self._weeks_pass(weekly.id, 2)
        self.assertEqual(await self._ahead(weekly.id), ROLLING_DATES - 2)
        last_before = (await self._rows(weekly.id))[-1]["scheduled_at"]
        added = await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        self.assertEqual(added, 2)
        self.assertEqual(await self._ahead(weekly.id), ROLLING_DATES)
        rows = await self._rows(weekly.id)
        self.assertEqual(len(rows), ROLLING_DATES + 2)
        self.assertEqual(
            [row["scheduled_at"] for row in rows[-2:]],
            [last_before + timedelta(weeks=1), last_before + timedelta(weeks=2)],
        )
        for row in rows[-2:]:
            self.assertEqual(row["status"], "open")
            self.assertEqual(row["start_at"], row["scheduled_at"])
        for index, row in enumerate(rows):
            moment = row["scheduled_at"].astimezone(timezone.utc)
            self.assertEqual((moment.weekday(), moment.hour, moment.minute), (5, 10, 0))
            if index:
                self.assertEqual(row["scheduled_at"] - rows[index - 1]["scheduled_at"], timedelta(hours=168))

    async def test_c_reading_the_activity_tops_up(self) -> None:
        weekly = await self._weekly()
        await self._weeks_pass(weekly.id, 2)
        loaded = await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        self.assertEqual(len(loaded.occurrences), ROLLING_DATES + 2)
        await self._weeks_pass(weekly.id, 3)
        listed = await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        mine = next(item for item in listed if item.id == weekly.id)
        self.assertEqual(len(mine.occurrences), ROLLING_DATES + 3)
        self.assertEqual(await self._ahead(weekly.id), ROLLING_DATES)

    async def test_d_top_up_twice_adds_nothing_more(self) -> None:
        weekly = await self._weekly()
        self.assertEqual(await ensure_future_activity_occurrences(self.conn, UUID(weekly.id)), 0)
        await self._weeks_pass(weekly.id, 2)
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        self.assertEqual(await ensure_future_activity_occurrences(self.conn, UUID(weekly.id)), 0)
        await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        rows = await self._rows(weekly.id)
        self.assertEqual(len(rows), ROLLING_DATES + 2)
        self.assertEqual(len({row["scheduled_at"] for row in rows}), len(rows))
        self.assertEqual(len({row["start_at"] for row in rows}), len(rows))

    async def test_e_cancelled_date_is_not_made_again(self) -> None:
        weekly = await self._weekly()
        last = weekly.occurrences[-1]
        await cancel_activity(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(last.id),
            reason="Courts closed",
        )
        await self._weeks_pass(weekly.id, 2)
        before = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        after = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        self.assertEqual(dict(after), dict(before))
        self.assertEqual(after["status"], "cancelled")
        self.assertEqual(after["cancellation_reason"], "Courts closed")
        same_week = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_occurrences WHERE activity_id = $1 AND scheduled_at = $2",
            UUID(weekly.id),
            before["scheduled_at"],
        )
        self.assertEqual(same_week, 1)
        rows = await self._rows(weekly.id)
        self.assertTrue(all(row["scheduled_at"] > before["scheduled_at"] for row in rows[-2:]))

    async def test_f_people_on_a_date_are_kept(self) -> None:
        weekly = await self._weekly()
        last = weekly.occurrences[-1]
        await join_occurrence(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(last.id))
        await self._weeks_pass(weekly.id, 2)
        date_before = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        people_before = [
            dict(row)
            for row in await self.conn.fetch(
                "SELECT * FROM activity_occurrence_participants WHERE occurrence_id = $1 ORDER BY id", UUID(last.id)
            )
        ]
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        date_after = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        people_after = [
            dict(row)
            for row in await self.conn.fetch(
                "SELECT * FROM activity_occurrence_participants WHERE occurrence_id = $1 ORDER BY id", UUID(last.id)
            )
        ]
        self.assertEqual(dict(date_after), dict(date_before))
        self.assertEqual(people_after, people_before)
        self.assertEqual(len(people_after), 1)
        new_rows = (await self._rows(weekly.id))[-2:]
        for row in new_rows:
            count = await self.conn.fetchval(
                "SELECT COUNT(*)::int FROM activity_occurrence_participants WHERE occurrence_id = $1", row["id"]
            )
            self.assertEqual(count, 0)

    async def test_g_accepted_time_change_is_kept(self) -> None:
        weekly = await self._weekly()
        last = weekly.occurrences[-1]
        moved_start = last.startAt - timedelta(days=1)
        suggested = await self._suggest_time(weekly.id, last.id, moved_start)
        from app.services.activity_suggestions import accept_suggestion

        await accept_suggestion(
            self.conn, user_id=self.member_id, suggestion_id=self._occurrence_suggestion_id(suggested, last.id, "time")
        )
        await self._weeks_pass(weekly.id, 2)
        before = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        self.assertEqual(before["start_at"], before["scheduled_at"] - timedelta(days=1))
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        after = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        self.assertEqual(dict(after), dict(before))
        rows = await self._rows(weekly.id)
        self.assertEqual(len(rows), ROLLING_DATES + 2)
        self.assertEqual(
            [row["scheduled_at"] for row in rows[-2:]],
            [before["scheduled_at"] + timedelta(weeks=1), before["scheduled_at"] + timedelta(weeks=2)],
        )

    async def _suggest_time(self, activity_id: str, occurrence_id: str, start: datetime):
        from app.services.activity_suggestions import create_occurrence_suggestion

        return await create_occurrence_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(activity_id),
            occurrence_id=UUID(occurrence_id),
            payload=ActivitySuggestionCreate.model_validate(
                {"type": "time", "proposedStartAt": start, "proposedEndAt": start + timedelta(hours=2)}
            ),
        )

    async def test_h_place_override_is_kept(self) -> None:
        from app.services.activity_suggestions import accept_suggestion, create_occurrence_suggestion

        weekly = await self._weekly()
        last = weekly.occurrences[-1]
        suggested = await create_occurrence_suggestion(
            self.conn,
            user_id=self.member_id,
            activity_id=UUID(weekly.id),
            occurrence_id=UUID(last.id),
            payload=ActivitySuggestionCreate.model_validate(
                {"type": "location", "proposedLocationName": "Indoor hall", "proposedLocationAddress": "Main St 4"}
            ),
        )
        await accept_suggestion(
            self.conn,
            user_id=self.member_id,
            suggestion_id=self._occurrence_suggestion_id(suggested, last.id, "location"),
        )
        await self._weeks_pass(weekly.id, 2)
        before = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        after = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        self.assertEqual(dict(after), dict(before))
        self.assertEqual(after["location_name_override"], "Indoor hall")
        self.assertEqual(after["location_address_override"], "Main St 4")
        for row in (await self._rows(weekly.id))[-2:]:
            self.assertIsNone(row["location_name_override"])
            self.assertIsNone(row["location_address_override"])

    async def test_i_date_statuses_are_kept(self) -> None:
        weekly = await self._weekly()
        first, second, third = weekly.occurrences[0], weekly.occurrences[1], weekly.occurrences[2]
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await confirm_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(third.id))
        await cancel_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(second.id))
        await self._weeks_pass(weekly.id, 2)
        await complete_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        before = {row["id"]: dict(row) for row in await self._rows(weekly.id)}
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        after = {row["id"]: dict(row) for row in await self._rows(weekly.id)}
        for key, row in before.items():
            self.assertEqual(after[key], row)
        self.assertEqual(after[UUID(first.id)]["status"], "completed")
        self.assertEqual(after[UUID(second.id)]["status"], "cancelled")
        self.assertEqual(after[UUID(third.id)]["status"], "confirmed")
        parent = await self.conn.fetchval("SELECT status FROM activities WHERE id = $1", UUID(weekly.id))
        self.assertEqual(parent, "open")

    async def test_j_one_time_activity_gets_no_dates(self) -> None:
        created = await create_activity(
            self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=_create_payload(title="Once")
        )
        await publish_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        self.assertEqual(await ensure_future_activity_occurrences(self.conn, UUID(created.id)), 0)
        self.assertEqual(len(await self._rows(created.id)), 0)

    async def test_j_draft_recurring_activity_gets_no_dates(self) -> None:
        payload = _create_payload(
            title="Draft weekly", startAt=_next_saturday_ten(), recurrenceType="recurring", recurrenceRule="Sat 10:00"
        )
        created = await create_activity(self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=payload)
        await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(created.id))
        self.assertEqual(await ensure_future_activity_occurrences(self.conn, UUID(created.id)), 0)
        self.assertEqual(len(await self._rows(created.id)), 0)

    async def test_rule_that_disagrees_with_the_first_date_is_rejected(self) -> None:
        with self.assertRaises(ValidationError) as rejected:
            _create_payload(
                title="Mismatch", startAt=_next_saturday_ten(), recurrenceType="recurring", recurrenceRule="Sun 10:00"
            )
        self.assertIn("The first date must fall on the weekly day and time", str(rejected.exception))

    async def test_service_rejects_a_mismatched_rule_that_skipped_the_request_check(self) -> None:
        payload = ActivityCreateRequest.model_construct(
            title="Mismatch",
            description=None,
            startAt=_next_saturday_ten(),
            endAt=None,
            recurrenceType="recurring",
            recurrenceRule="Sun 10:00",
            locationName=None,
            locationAddress=None,
            groupSize=4,
            paymentType="free",
            priceAmount=None,
            currency=None,
        )
        with self.assertRaises(HTTPException) as rejected:
            await create_activity(self.conn, user_id=self.member_id, circle_id=self.circle_id, payload=payload)
        self.assertEqual(rejected.exception.status_code, 400)
        self.assertEqual(rejected.exception.detail, "The first date must fall on the weekly day and time")

    async def test_moving_a_date_onto_another_dates_time_is_refused(self) -> None:
        from app.services.activity_suggestions import accept_suggestion

        weekly = await self._weekly()
        first, second = weekly.occurrences[0], weekly.occurrences[1]
        suggested = await self._suggest_time(weekly.id, first.id, second.startAt)
        before = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(first.id))
        with self.assertRaises(HTTPException) as refused:
            await accept_suggestion(
                self.conn,
                user_id=self.member_id,
                suggestion_id=self._occurrence_suggestion_id(suggested, first.id, "time"),
            )
        self.assertEqual(refused.exception.status_code, 409)
        after = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(first.id))
        self.assertEqual(dict(after), dict(before))
        status = await self.conn.fetchval(
            "SELECT status FROM activity_suggestions WHERE id = $1",
            self._occurrence_suggestion_id(suggested, first.id, "time"),
        )
        self.assertEqual(status, "open")

    async def test_week_taken_by_a_moved_date_is_skipped(self) -> None:
        from app.services.activity_suggestions import accept_suggestion

        weekly = await self._weekly()
        last = weekly.occurrences[-1]
        next_week = last.startAt + timedelta(weeks=1)
        suggested = await self._suggest_time(weekly.id, last.id, next_week)
        await accept_suggestion(
            self.conn, user_id=self.member_id, suggestion_id=self._occurrence_suggestion_id(suggested, last.id, "time")
        )
        await self._weeks_pass(weekly.id, 2)
        moved = await self.conn.fetchrow("SELECT * FROM activity_occurrences WHERE id = $1", UUID(last.id))
        self.assertEqual(moved["start_at"] - moved["scheduled_at"], timedelta(weeks=1))
        added = await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        self.assertEqual(added, 2)
        rows = await self._rows(weekly.id)
        self.assertEqual(dict(next(row for row in rows if row["id"] == UUID(last.id))), dict(moved))
        self.assertEqual(
            [row["scheduled_at"] for row in rows[-2:]],
            [moved["scheduled_at"] + timedelta(weeks=2), moved["scheduled_at"] + timedelta(weeks=3)],
        )
        self.assertEqual(len({row["start_at"] for row in rows}), len(rows))
        self.assertEqual(await self._ahead(weekly.id), ROLLING_DATES)

    async def test_l_top_up_leaves_legacy_rows_alone(self) -> None:
        before = await self._counts()
        weekly = await self._weekly()
        await self._weeks_pass(weekly.id, 3)
        await ensure_future_activity_occurrences(self.conn, UUID(weekly.id))
        await get_activity(self.conn, user_id=self.member_id, activity_id=UUID(weekly.id))
        await list_activities_for_circle(self.conn, user_id=self.member_id, circle_id=self.circle_id)
        self.assertEqual(await self._counts(), before)

    async def test_k_concurrent_top_up_adds_each_week_once(self) -> None:
        url = os.environ["DATABASE_URL"]
        outside = await asyncpg.connect(url)
        await outside.execute(f"SET TIME ZONE '{SESSION_ZONE}'")
        activity_id: UUID | None = None
        try:
            weekly = await self._weekly(outside)
            activity_id = UUID(weekly.id)
            await self._weeks_pass(weekly.id, 3, outside)

            async def attempt() -> int:
                conn = await asyncpg.connect(url)
                try:
                    return await ensure_future_activity_occurrences(conn, activity_id)
                finally:
                    await conn.close()

            added = await asyncio.gather(attempt(), attempt(), attempt())
            self.assertEqual(sum(added), 3)
            rows = await self._rows(weekly.id, outside)
            self.assertEqual(len(rows), ROLLING_DATES + 3)
            self.assertEqual(len({row["scheduled_at"] for row in rows}), len(rows))
            ahead = await outside.fetchval(
                "SELECT COUNT(*)::int FROM activity_occurrences WHERE activity_id = $1 AND scheduled_at > NOW()",
                activity_id,
            )
            self.assertEqual(int(ahead), ROLLING_DATES)
        finally:
            if activity_id is not None:
                await outside.execute("DELETE FROM activities WHERE id = $1", activity_id)
            await outside.close()


if __name__ == "__main__":
    unittest.main()

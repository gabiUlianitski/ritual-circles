"""Actual attendance outcomes after an Activity or date ends. Database checks roll back and do not keep rows."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID

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
from app.services.activity_attendance import record_attendance, record_date_attendance
from app.services.activity_participants import join_activity, join_occurrence, leave_activity
from app.services.activity_suggestions import accept_suggestion, create_suggestion, support_suggestion
from app.services.circle_members import activate_member
from tests.test_activities import ROOT, _create_payload

_DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


class ActivityAttendanceTests(unittest.IsolatedAsyncioTestCase):
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
        migrated = await self.conn.fetchval(
            """
            SELECT COUNT(*)::int FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'attendance_status'
              AND table_name IN ('activity_participants', 'activity_occurrence_participants')
            """
        )
        if migrated != 2:
            self.skipTest("migration 046 not applied")
        row = await self.conn.fetchrow(
            """
            SELECT c.id AS circle_id, c.created_by
            FROM circles c
            JOIN circle_members m ON m.circle_id = c.id AND m.status = 'active'
            LIMIT 1
            """
        )
        if not row:
            self.skipTest("no active circle")
        self.circle_id = row["circle_id"]
        self.owner_id = row["created_by"]
        others = await self.conn.fetch(
            "SELECT id FROM users WHERE id <> $1 ORDER BY id LIMIT 3",
            self.owner_id,
        )
        if len(others) < 3:
            self.skipTest("needs three more users")
        self.organizer, self.a, self.b = (item["id"] for item in others)
        for user in (self.organizer, self.a, self.b):
            await activate_member(self.conn, user_id=user, circle_id=self.circle_id)

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

    async def _weekly(self):
        start = datetime(2026, 11, 2, 18, 0, tzinfo=timezone.utc)
        return await self._activity(
            title="Weekly tennis",
            startAt=start,
            recurrenceType="recurring",
            recurrenceRule=f"{_DAYS[start.weekday()]} {start:%H:%M}",
            locationName="Park courts",
        )

    async def _end(self, activity_id: str) -> None:
        await self.conn.execute(
            """
            UPDATE activities
            SET start_at = NOW() - INTERVAL '3 hours', end_at = NOW() - INTERVAL '1 hour'
            WHERE id = $1
            """,
            UUID(activity_id),
        )

    async def _end_date(self, occurrence_id: str, weeks_ago: int = 1) -> None:
        await self.conn.execute(
            """
            UPDATE activity_occurrences
            SET start_at = NOW() - make_interval(weeks => $2) - INTERVAL '3 hours',
                end_at = NOW() - make_interval(weeks => $2) - INTERVAL '1 hour'
            WHERE id = $1
            """,
            UUID(occurrence_id),
            weeks_ago,
        )

    async def _ended_one_time(self, *users: UUID):
        activity = await self._activity()
        for user in users:
            await join_activity(self.conn, user_id=user, activity_id=UUID(activity.id))
        await self._end(activity.id)
        return activity

    async def _participant(self, activity_id: str, user_id: UUID) -> UUID:
        return await self.conn.fetchval(
            "SELECT id FROM activity_participants WHERE activity_id = $1 AND user_id = $2",
            UUID(activity_id),
            user_id,
        )

    async def _date_participant(self, occurrence_id: str, user_id: UUID) -> UUID:
        return await self.conn.fetchval(
            "SELECT id FROM activity_occurrence_participants WHERE occurrence_id = $1 AND user_id = $2",
            UUID(occurrence_id),
            user_id,
        )

    async def _row(self, table: str, participant_id: UUID) -> asyncpg.Record:
        return await self.conn.fetchrow(
            f"SELECT status, attendance_status, confirmation_required FROM {table} WHERE id = $1",
            participant_id,
        )

    async def _mark(self, activity_id: str, participant_id: UUID, outcome: str, user_id: UUID | None = None):
        return await record_attendance(
            self.conn,
            user_id=user_id or self.organizer,
            activity_id=UUID(activity_id),
            participant_id=participant_id,
            attendance_status=outcome,
        )

    async def _mark_date(self, activity_id: str, occurrence_id: str, participant_id: UUID, outcome: str):
        return await record_date_attendance(
            self.conn,
            user_id=self.organizer,
            activity_id=UUID(activity_id),
            occurrence_id=UUID(occurrence_id),
            participant_id=participant_id,
            attendance_status=outcome,
        )

    async def test_a_columns_default_to_pending(self) -> None:
        columns = await self.conn.fetch(
            """
            SELECT table_name, is_nullable, column_default FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'attendance_status'
            ORDER BY table_name
            """
        )
        self.assertEqual([row["table_name"] for row in columns], ["activity_occurrence_participants", "activity_participants"])
        for row in columns:
            self.assertEqual(row["is_nullable"], "NO")
            self.assertIn("'pending'", row["column_default"])
        activity = await self._activity()
        await join_activity(self.conn, user_id=self.a, activity_id=UUID(activity.id))
        row = await self._row("activity_participants", await self._participant(activity.id, self.a))
        self.assertEqual((row["status"], row["attendance_status"]), ("going", "pending"))
        with self.assertRaises(asyncpg.CheckViolationError):
            await self.conn.execute(
                "UPDATE activity_participants SET attendance_status = 'late' WHERE activity_id = $1",
                UUID(activity.id),
            )

    async def test_b_creator_marks_attended(self) -> None:
        activity = await self._ended_one_time(self.a)
        participant = await self._participant(activity.id, self.a)
        await self._mark(activity.id, participant, "attended")
        row = await self._row("activity_participants", participant)
        self.assertEqual((row["status"], row["attendance_status"]), ("going", "attended"))

    async def test_c_creator_marks_no_show(self) -> None:
        activity = await self._ended_one_time(self.a)
        participant = await self._participant(activity.id, self.a)
        await self._mark(activity.id, participant, "no_show")
        row = await self._row("activity_participants", participant)
        self.assertEqual((row["status"], row["attendance_status"]), ("going", "no_show"))

    async def test_d_future_activity_rejected(self) -> None:
        activity = await self._activity()
        await join_activity(self.conn, user_id=self.a, activity_id=UUID(activity.id))
        participant = await self._participant(activity.id, self.a)
        with self.assertRaises(HTTPException) as caught:
            await self._mark(activity.id, participant, "attended")
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, "This activity hasn't ended yet")

    async def test_e_cancelled_participant_rejected(self) -> None:
        activity = await self._activity()
        await join_activity(self.conn, user_id=self.a, activity_id=UUID(activity.id))
        await leave_activity(self.conn, user_id=self.a, activity_id=UUID(activity.id))
        await self._end(activity.id)
        participant = await self._participant(activity.id, self.a)
        with self.assertRaises(HTTPException) as caught:
            await self._mark(activity.id, participant, "no_show")
        self.assertEqual(caught.exception.detail, "This participant was not going")
        row = await self._row("activity_participants", participant)
        self.assertEqual((row["status"], row["attendance_status"]), ("cancelled", "pending"))

    async def test_f_ordinary_member_cannot_mark(self) -> None:
        activity = await self._ended_one_time(self.a, self.b)
        participant = await self._participant(activity.id, self.a)
        with self.assertRaises(HTTPException) as caught:
            await self._mark(activity.id, participant, "no_show", user_id=self.b)
        self.assertEqual(caught.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            await self._mark(activity.id, participant, "attended", user_id=self.a)
        row = await self._row("activity_participants", participant)
        self.assertEqual(row["attendance_status"], "pending")

    async def test_g_circle_owner_can_mark(self) -> None:
        activity = await self._ended_one_time(self.a)
        participant = await self._participant(activity.id, self.a)
        await self._mark(activity.id, participant, "attended", user_id=self.owner_id)
        self.assertEqual((await self._row("activity_participants", participant))["attendance_status"], "attended")

    async def test_h_recurring_outcome_belongs_to_one_date(self) -> None:
        weekly = await self._weekly()
        first, second, third = weekly.occurrences[0], weekly.occurrences[1], weekly.occurrences[2]
        for occurrence in (first, second, third):
            await join_occurrence(self.conn, user_id=self.a, activity_id=UUID(weekly.id), occurrence_id=UUID(occurrence.id))
        await self._end_date(first.id, weeks_ago=2)
        await self._end_date(second.id, weeks_ago=1)
        one = await self._date_participant(first.id, self.a)
        two = await self._date_participant(second.id, self.a)
        three = await self._date_participant(third.id, self.a)
        await self._mark_date(weekly.id, first.id, one, "attended")
        await self._mark_date(weekly.id, second.id, two, "no_show")
        table = "activity_occurrence_participants"
        self.assertEqual((await self._row(table, one))["attendance_status"], "attended")
        self.assertEqual((await self._row(table, two))["attendance_status"], "no_show")
        self.assertEqual((await self._row(table, three))["attendance_status"], "pending")
        with self.assertRaises(HTTPException) as caught:
            await self._mark_date(weekly.id, third.id, three, "attended")
        self.assertEqual(caught.exception.detail, "This activity hasn't ended yet")
        with self.assertRaises(HTTPException):
            await self._mark_date(weekly.id, second.id, one, "attended")
        with self.assertRaises(HTTPException):
            await self._mark(weekly.id, one, "attended")

    async def test_i_cancelled_date_rejected(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await join_occurrence(self.conn, user_id=self.a, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await cancel_activity(self.conn, user_id=self.organizer, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await self._end_date(first.id)
        participant = await self._date_participant(first.id, self.a)
        with self.assertRaises(HTTPException) as caught:
            await self._mark_date(weekly.id, first.id, participant, "attended")
        self.assertEqual(caught.exception.detail, "Attendance can't be recorded for a date that did not happen")

    async def test_i_cancelled_one_time_rejected(self) -> None:
        activity = await self._activity()
        await join_activity(self.conn, user_id=self.a, activity_id=UUID(activity.id))
        await cancel_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        await self._end(activity.id)
        participant = await self._participant(activity.id, self.a)
        with self.assertRaises(HTTPException) as caught:
            await self._mark(activity.id, participant, "attended")
        self.assertEqual(caught.exception.detail, "Attendance can't be recorded for a cancelled activity")

    async def test_j_past_open_date_allows_attendance(self) -> None:
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await join_occurrence(self.conn, user_id=self.a, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await self._end_date(first.id)
        status = await self.conn.fetchval("SELECT status FROM activity_occurrences WHERE id = $1", UUID(first.id))
        self.assertEqual(status, "open")
        participant = await self._date_participant(first.id, self.a)
        saved = await self._mark_date(weekly.id, first.id, participant, "attended")
        view = next(item for item in saved.occurrences if item.id == first.id)
        self.assertTrue(view.hasEnded)
        self.assertEqual([entry.attendanceStatus for entry in view.attendance], ["attended"])

    async def test_k_outcome_can_be_corrected(self) -> None:
        activity = await self._ended_one_time(self.a)
        participant = await self._participant(activity.id, self.a)
        for outcome in ("attended", "no_show", "attended"):
            await self._mark(activity.id, participant, outcome)
            self.assertEqual((await self._row("activity_participants", participant))["attendance_status"], outcome)

    async def test_l_completion_needs_no_outcomes(self) -> None:
        activity = await self._activity()
        for user in (self.a, self.b):
            await join_activity(self.conn, user_id=user, activity_id=UUID(activity.id))
        await confirm_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        await self._end(activity.id)
        completed = await complete_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        self.assertEqual(completed.status, "completed")
        self.assertEqual({entry.attendanceStatus for entry in completed.attendance}, {"pending"})
        participant = await self._participant(activity.id, self.a)
        await self._mark(activity.id, participant, "attended")
        self.assertEqual((await self._row("activity_participants", participant))["attendance_status"], "attended")

    async def test_m_ended_participant_stays_pending(self) -> None:
        activity = await self._ended_one_time(self.a)
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await join_occurrence(self.conn, user_id=self.a, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await self._end_date(first.id)
        for user in (self.organizer, self.a):
            await get_activity(self.conn, user_id=user, activity_id=UUID(activity.id))
            await get_activity(self.conn, user_id=user, activity_id=UUID(weekly.id))
        one = await self._row("activity_participants", await self._participant(activity.id, self.a))
        date = await self._row("activity_occurrence_participants", await self._date_participant(first.id, self.a))
        self.assertEqual((one["status"], one["attendance_status"]), ("going", "pending"))
        self.assertEqual((date["status"], date["attendance_status"]), ("going", "pending"))

    async def test_n_circle_membership_unchanged(self) -> None:
        activity = await self._ended_one_time(self.a, self.b)
        before = await self.conn.fetch(
            "SELECT user_id, status, joined_at FROM circle_members WHERE circle_id = $1 ORDER BY user_id",
            self.circle_id,
        )
        await self._mark(activity.id, await self._participant(activity.id, self.a), "no_show")
        await self._mark(activity.id, await self._participant(activity.id, self.b), "attended")
        after = await self.conn.fetch(
            "SELECT user_id, status, joined_at FROM circle_members WHERE circle_id = $1 ORDER BY user_id",
            self.circle_id,
        )
        self.assertEqual([tuple(row) for row in before], [tuple(row) for row in after])

    async def test_o_legacy_tables_untouched(self) -> None:
        sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        legacy = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        activity = await self._ended_one_time(self.a)
        await self._mark(activity.id, await self._participant(activity.id, self.a), "attended")
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions"), sessions)
        self.assertEqual(await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance"), legacy)
        source = (ROOT / "backend" / "app" / "services" / "activity_attendance.py").read_text(encoding="utf-8")
        self.assertNotIn("FROM attendance", source)
        self.assertNotIn("sessions", source)

    async def test_p_suggestions_and_reconfirmation_unchanged(self) -> None:
        activity = await self._activity()
        for user in (self.a, self.b):
            await join_activity(self.conn, user_id=user, activity_id=UUID(activity.id))
        await confirm_activity(self.conn, user_id=self.organizer, activity_id=UUID(activity.id))
        later = datetime(2026, 11, 3, 14, 0, tzinfo=timezone.utc)
        suggested = await create_suggestion(
            self.conn,
            user_id=self.a,
            activity_id=UUID(activity.id),
            payload=ActivitySuggestionCreate.model_validate(
                {"type": "time", "proposedStartAt": later, "proposedEndAt": later + timedelta(hours=2)}
            ),
        )
        suggestion = next(item for item in suggested.suggestions if item.status == "open")
        await support_suggestion(self.conn, user_id=self.b, suggestion_id=UUID(suggestion.id))
        await accept_suggestion(self.conn, user_id=self.organizer, suggestion_id=UUID(suggestion.id))
        await self._end(activity.id)
        support = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_suggestion_support WHERE suggestion_id = $1", UUID(suggestion.id)
        )
        notices = await self.conn.fetchval(
            "SELECT COUNT(*)::int FROM activity_notifications WHERE activity_id = $1", UUID(activity.id)
        )
        participant = await self._participant(activity.id, self.b)
        await self._mark(activity.id, participant, "attended")
        row = await self._row("activity_participants", participant)
        self.assertEqual((row["status"], row["confirmation_required"]), ("going", True))
        self.assertEqual(
            await self.conn.fetchval("SELECT status FROM activity_suggestions WHERE id = $1", UUID(suggestion.id)),
            "accepted",
        )
        self.assertEqual(
            await self.conn.fetchval(
                "SELECT COUNT(*)::int FROM activity_suggestion_support WHERE suggestion_id = $1", UUID(suggestion.id)
            ),
            support,
        )
        self.assertEqual(
            await self.conn.fetchval(
                "SELECT COUNT(*)::int FROM activity_notifications WHERE activity_id = $1", UUID(activity.id)
            ),
            notices,
        )

    async def test_q_members_never_receive_outcomes(self) -> None:
        activity = await self._ended_one_time(self.a, self.b)
        await self._mark(activity.id, await self._participant(activity.id, self.a), "no_show")
        weekly = await self._weekly()
        first = weekly.occurrences[0]
        await join_occurrence(self.conn, user_id=self.a, activity_id=UUID(weekly.id), occurrence_id=UUID(first.id))
        await self._end_date(first.id)
        await self._mark_date(weekly.id, first.id, await self._date_participant(first.id, self.a), "no_show")
        for user in (self.a, self.b):
            one = await get_activity(self.conn, user_id=user, activity_id=UUID(activity.id))
            series = await get_activity(self.conn, user_id=user, activity_id=UUID(weekly.id))
            self.assertIsNone(one.attendance)
            self.assertTrue(all(item.attendance is None for item in series.occurrences))
            for view in (one, series):
                text = view.model_dump_json()
                self.assertNotIn("no_show", text)
                self.assertNotIn("attendanceStatus", text)

    async def test_r_organizers_receive_roster(self) -> None:
        activity = await self._ended_one_time(self.a, self.b)
        await self._mark(activity.id, await self._participant(activity.id, self.a), "no_show")
        for user in (self.organizer, self.owner_id):
            view = await get_activity(self.conn, user_id=user, activity_id=UUID(activity.id))
            outcomes = sorted(entry.attendanceStatus for entry in view.attendance)
            self.assertEqual(outcomes, ["no_show", "pending"])
            self.assertTrue(all(entry.participantId for entry in view.attendance))
        upcoming = await self._activity()
        await join_activity(self.conn, user_id=self.a, activity_id=UUID(upcoming.id))
        before = await get_activity(self.conn, user_id=self.organizer, activity_id=UUID(upcoming.id))
        self.assertIsNone(before.attendance)

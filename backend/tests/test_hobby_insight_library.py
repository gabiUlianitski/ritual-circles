"""Insight library validation, replacement safety, daily selection, and access rules."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from uuid import UUID, uuid4

from app.services.hobby_insight_library import (
    INSIGHT_TYPES,
    QUOTA,
    InsightValidationError,
    catalogue_admin_allowed,
    select_daily_insight,
    stable_hash,
    store_library,
    validate_library,
)

ROOT = Path(__file__).resolve().parents[2]
HOBBY_ID = "11111111-1111-1111-1111-111111111111"


def _line(index: int, insight_type: str) -> str:
    state = index * 104729 + 17
    parts: list[str] = []
    for _ in range(5):
        state = (state * 1103515245 + 12345) & 0x7FFFFFFF
        parts.append(f"w{state % 100000}")
    return f"{' '.join(parts)} makes {insight_type} item {index} worth noticing together."


def _library(**overrides: object) -> dict:
    items = []
    index = 1
    for insight_type, count in QUOTA.items():
        for _ in range(count):
            items.append(
                {
                    "type": insight_type,
                    "contentEn": _line(index, insight_type),
                    "contentHe": "שורה חמה בעברית שפותחת שיחה רגועה סביב התחביב.",
                }
            )
            index += 1
    payload = {"hobbyId": HOBBY_ID, "hobbyName": "Coffee", "insights": items}
    payload.update(overrides)
    return payload


class ValidateLibraryTests(unittest.TestCase):
    def test_accepts_exact_distribution(self) -> None:
        items = validate_library(_library(), hobby_id=HOBBY_ID, hobby_name="Coffee")
        self.assertEqual(len(items), 50)
        for insight_type, count in QUOTA.items():
            self.assertEqual(sum(1 for item in items if item["type"] == insight_type), count)

    def test_rejects_duplicate_english(self) -> None:
        payload = _library()
        payload["insights"][1]["contentEn"] = payload["insights"][0]["contentEn"]
        with self.assertRaises(InsightValidationError):
            validate_library(payload, hobby_id=HOBBY_ID, hobby_name="Coffee")

    def test_rejects_near_duplicate(self) -> None:
        payload = _library()
        payload["insights"][1]["contentEn"] = payload["insights"][0]["contentEn"].replace("together", "togethar")
        with self.assertRaises(InsightValidationError):
            validate_library(payload, hobby_id=HOBBY_ID, hobby_name="Coffee")

    def test_rejects_malformed_and_wrong_hobby(self) -> None:
        broken = _library()
        broken["insights"][0]["contentEn"] = ""
        with self.assertRaises(InsightValidationError):
            validate_library(broken, hobby_id=HOBBY_ID, hobby_name="Coffee")
        wrong = _library(hobbyName="Tennis")
        with self.assertRaises(InsightValidationError):
            validate_library(wrong, hobby_id=HOBBY_ID, hobby_name="Coffee")

    def test_rejects_wrong_distribution(self) -> None:
        payload = _library()
        payload["insights"][0]["type"] = "motivation"
        with self.assertRaises(InsightValidationError):
            validate_library(payload, hobby_id=HOBBY_ID, hobby_name="Coffee")

    def test_drops_low_quality_hebrew_without_failing_english(self) -> None:
        payload = _library()
        payload["insights"][0]["contentHe"] = payload["insights"][0]["contentEn"]
        items = validate_library(payload, hobby_id=HOBBY_ID, hobby_name="Coffee")
        self.assertIsNone(items[0]["contentHe"])
        self.assertTrue(items[1]["contentHe"])


class SelectionTests(unittest.TestCase):
    def _rows(self) -> list[dict]:
        rows = []
        for insight_type in INSIGHT_TYPES:
            for index in range(3):
                rows.append(
                    {
                        "id": f"{insight_type}-{index}",
                        "insight_type": insight_type,
                        "is_active": True,
                    }
                )
        return rows

    def test_same_day_is_stable_and_another_day_can_change(self) -> None:
        rows = self._rows()
        first = select_daily_insight(rows, HOBBY_ID, "2026-10-08")
        again = select_daily_insight(rows, HOBBY_ID, "2026-10-08")
        self.assertEqual(first, again)
        seen = {select_daily_insight(rows, HOBBY_ID, f"2026-10-{day:02d}")["id"] for day in range(1, 28)}
        self.assertGreater(len(seen), 1)

    def test_empty_library_returns_none(self) -> None:
        self.assertIsNone(select_daily_insight([], HOBBY_ID, "2026-10-08"))

    def test_hash_matches_the_rolling_web_contract(self) -> None:
        key = "abc:2026-10-08"
        total = 0
        for ch in key:
            total = (total + ord(ch)) & 0xFFFFFFFF
        self.assertEqual(stable_hash(key), total)


class AccessTests(unittest.TestCase):
    def test_anonymous_cannot_generate(self) -> None:
        self.assertFalse(catalogue_admin_allowed(authenticated=False, email="a@b.c", allowlist=set()))

    def test_allowlist_blocks_other_signed_in_users(self) -> None:
        allow = {"owner@example.com"}
        self.assertTrue(
            catalogue_admin_allowed(authenticated=True, email="Owner@Example.com", allowlist=allow)
        )
        self.assertFalse(catalogue_admin_allowed(authenticated=True, email="member@example.com", allowlist=allow))


class ReplacementTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_insert_does_not_retire_the_active_batch(self) -> None:
        conn = _FakeConn(fail_insert=True)
        items = validate_library(_library(), hobby_id=HOBBY_ID, hobby_name="Coffee")
        with self.assertRaises(RuntimeError):
            await store_library(conn, hobby_id=UUID(HOBBY_ID), batch_id=uuid4(), items=items)
        self.assertNotIn("retire", conn.ops)
        self.assertIn("rollback", conn.ops)

    async def test_success_inserts_before_retiring_previous_rows(self) -> None:
        conn = _FakeConn(fail_insert=False)
        items = validate_library(_library(), hobby_id=HOBBY_ID, hobby_name="Coffee")
        count = await store_library(conn, hobby_id=UUID(HOBBY_ID), batch_id=uuid4(), items=items)
        self.assertEqual(count, 50)
        self.assertEqual(conn.ops[:2], ["begin", "insert"])
        self.assertIn("retire", conn.ops)
        self.assertLess(conn.ops.index("insert"), conn.ops.index("retire"))
        self.assertIn("commit", conn.ops)


class ContractTests(unittest.TestCase):
    def test_generate_action_is_only_for_one_selected_hobby(self) -> None:
        source = (ROOT / "web" / "src" / "ui" / "Hobies.tsx").read_text(encoding="utf-8")
        self.assertIn("selected.length === 1", source)
        self.assertIn("hobbiesPage.bulkRegenerate", source)
        self.assertIn("hobbiesPage.generate50", source)
        self.assertLess(source.index("hobbiesPage.generate50"), source.index("hobbiesPage.bulkRegenerate"))

    def test_home_does_not_call_ai(self) -> None:
        source = (ROOT / "web" / "src" / "ui" / "TodaysDiscovery.tsx").read_text(encoding="utf-8")
        self.assertNotIn("dailyInsight", source)
        self.assertNotIn("todaysDiscovery", source)
        self.assertNotIn("/discoveries/today", source)
        self.assertIn("dailyLibraryInsight", source)

    def test_locale_labels_exist_in_english_and_hebrew(self) -> None:
        keys = [
            "generate50",
            "regenerate50",
            "generatingInsights",
            "generateTitle",
            "regenerateTitle",
            "generateAndReplace",
            "insightsNone",
            "insightsReady",
            "insightsPartial",
            "insightGenerated",
            "insightFailed",
            "insightPreserved",
        ]
        for name in ("en.json", "he.json"):
            data = json.loads((ROOT / "web" / "src" / "locales" / name).read_text(encoding="utf-8"))
            page = data["hobbiesPage"]
            for key in keys:
                self.assertTrue(str(page.get(key) or "").strip(), f"{name} hobbiesPage.{key}")
            self.assertTrue(data["common"]["cancel"])
            self.assertTrue(data["common"]["close"])

    def test_migration_creates_library_table(self) -> None:
        sql = (ROOT / "db" / "migrations" / "036_hobby_insights.sql").read_text(encoding="utf-8")
        self.assertIn("CREATE TABLE IF NOT EXISTS hobby_insights", sql)
        self.assertIn("REFERENCES hobies(id)", sql)
        for index in (
            "idx_hobby_insights_hobby",
            "idx_hobby_insights_hobby_active",
            "idx_hobby_insights_hobby_type",
            "idx_hobby_insights_batch",
        ):
            self.assertIn(index, sql)


class _FakeConn:
    def __init__(self, *, fail_insert: bool) -> None:
        self.fail_insert = fail_insert
        self.ops: list[str] = []

    def transaction(self):
        return _FakeTxn(self)

    async def executemany(self, *_args) -> None:
        if self.fail_insert:
            raise RuntimeError("insert failed")
        self.ops.append("insert")

    async def execute(self, *_args) -> None:
        self.ops.append("retire")

    async def fetchval(self, *_args) -> int:
        self.ops.append("count")
        return 50


class _FakeTxn:
    def __init__(self, conn: _FakeConn) -> None:
        self.conn = conn

    async def __aenter__(self):
        self.conn.ops.append("begin")
        return self

    async def __aexit__(self, exc_type, _exc, _tb):
        self.conn.ops.append("rollback" if exc_type else "commit")
        return False


if __name__ == "__main__":
    unittest.main()

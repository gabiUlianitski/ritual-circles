"""Visible copy calls the gathering an Activity. Plan stays only as a verb."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "web" / "src" / "locales"

# A standalone "plan"/"plans". "planned" and "planning" do not match.
_PLAN_WORD = re.compile(r"\bplans?\b", re.IGNORECASE)
_ALLOWED_PLAN = (
    "plan an activity",
    "plan activity",
    "plan the first activity",
)
_HEBREW_PLAN_NOUN = ("תוכנית", "תוכניות")
_PLAN_NOUN_PHRASES = (
    "create plan",
    "new plan",
    "join plan",
    "leave plan",
    "plan details",
    "publish plan",
    "confirm plan",
    "cancel plan",
    "upcoming plans",
    "past plans",
    "my plans",
    "recurring plan",
    "this plan",
    "the plan",
)
WEB_SRC = ROOT / "web" / "src"
_DETAIL = re.compile(r"""detail\s*=\s*(?:\([^)]*\)\s*)?["']([^"']*)["']""")


def _strings(value: object):
    if isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)
    elif isinstance(value, str):
        yield value


class ActivityTerminologyTests(unittest.TestCase):
    def test_english_copy_uses_plan_only_as_a_verb(self) -> None:
        values = list(_strings(json.loads((LOCALES / "en.json").read_text(encoding="utf-8"))))
        leftover = []
        for value in values:
            if not _PLAN_WORD.search(value):
                continue
            lowered = value.lower()
            if any(allowed in lowered for allowed in _ALLOWED_PLAN):
                continue
            leftover.append(value)
        self.assertEqual(leftover, [])

    def test_hebrew_copy_does_not_call_an_activity_a_plan(self) -> None:
        values = list(_strings(json.loads((LOCALES / "he.json").read_text(encoding="utf-8"))))
        leftover = [value for value in values if any(noun in value for noun in _HEBREW_PLAN_NOUN)]
        self.assertEqual(leftover, [])

    def test_backend_errors_do_not_call_an_activity_a_plan(self) -> None:
        leftover = []
        for path in (ROOT / "backend" / "app").rglob("*.py"):
            for detail in _DETAIL.findall(path.read_text(encoding="utf-8")):
                if _PLAN_WORD.search(detail):
                    leftover.append(f"{path.name}: {detail}")
        self.assertEqual(leftover, [])

    def test_web_source_has_no_plan_noun_phrases(self) -> None:
        leftover = []
        for path in WEB_SRC.rglob("*"):
            if path.suffix not in (".ts", ".tsx", ".json", ".css"):
                continue
            text = path.read_text(encoding="utf-8")
            leftover += [
                f"{path.name}: {phrase}"
                for phrase in _PLAN_NOUN_PHRASES
                if re.search(rf"\b{phrase}\b", text, re.IGNORECASE)
            ]
        self.assertEqual(leftover, [])


if __name__ == "__main__":
    unittest.main()

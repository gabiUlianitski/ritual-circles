"""Circle name identity: persisted name, derived title, and blank-to-null input."""

import unittest
from pathlib import Path

from pydantic import ValidationError

from app.circle_identity import (
    CIRCLE_DESCRIPTION_MAX,
    CIRCLE_NAME_MAX,
    GENERIC_CIRCLE_TITLE,
    circle_identity,
    normalize_circle_description,
    normalize_circle_name,
)
from app.schemas import CircleCreateRequest, CirclePatchRequest

ROOT = Path(__file__).resolve().parents[2]


def _create(**kwargs: object) -> CircleCreateRequest:
    payload: dict[str, object] = {
        "ritualType": "cycling",
        "modality": "offline",
        "recurringTime": "Sunday 17:00",
    }
    payload.update(kwargs)
    return CircleCreateRequest.model_validate(payload)


class CircleIdentityTests(unittest.TestCase):
    def test_blank_and_whitespace_become_null(self) -> None:
        self.assertIsNone(normalize_circle_name(None))
        self.assertIsNone(normalize_circle_name(""))
        self.assertIsNone(normalize_circle_name("   "))
        self.assertIsNone(normalize_circle_name("\n\t"))

    def test_trim_keeps_internal_spaces(self) -> None:
        self.assertEqual(normalize_circle_name("  Sunday  Lake Riders  "), "Sunday  Lake Riders")

    def test_custom_name_is_the_display_title(self) -> None:
        stored, title, has_custom, hobby = circle_identity(" Sunday Lake Riders ", "Cycling", "cycling")
        self.assertEqual(stored, "Sunday Lake Riders")
        self.assertEqual(title, "Sunday Lake Riders")
        self.assertTrue(has_custom)
        self.assertEqual(hobby, "Cycling")

    def test_unnamed_circle_uses_hobby_then_slug_then_generic(self) -> None:
        stored, title, has_custom, hobby = circle_identity(None, "Cycling", "cycling")
        self.assertIsNone(stored)
        self.assertEqual(title, "Cycling")
        self.assertFalse(has_custom)
        self.assertEqual(hobby, "Cycling")

        stored, title, has_custom, _hobby = circle_identity("   ", None, "cycling")
        self.assertIsNone(stored)
        self.assertEqual(title, "cycling")
        self.assertFalse(has_custom)

        stored, title, has_custom, hobby = circle_identity(None, None, None)
        self.assertIsNone(stored)
        self.assertEqual(title, GENERIC_CIRCLE_TITLE)
        self.assertFalse(has_custom)
        self.assertIsNone(hobby)

    def test_hebrew_and_mixed_names_stay_user_text(self) -> None:
        stored, title, has_custom, hobby = circle_identity("  רוכבי האגם  ", "Cycling", "cycling")
        self.assertEqual(stored, "רוכבי האגם")
        self.assertEqual(title, stored)
        self.assertTrue(has_custom)
        self.assertEqual(hobby, "Cycling")

    def test_duplicate_names_are_both_accepted(self) -> None:
        first = _create(name="Sunday Lake Riders")
        second = _create(name="Sunday Lake Riders")
        self.assertEqual(first.name, "Sunday Lake Riders")
        self.assertEqual(second.name, "Sunday Lake Riders")

    def test_create_without_name_stores_null(self) -> None:
        created = _create()
        self.assertIsNone(created.name)
        self.assertNotIn("name", created.model_fields_set)

    def test_blank_description_is_null_and_text_is_trimmed(self) -> None:
        self.assertIsNone(normalize_circle_description(None))
        self.assertIsNone(normalize_circle_description("  \n  "))
        self.assertEqual(normalize_circle_description("  line one\nline two  "), "line one\nline two")
        self.assertIsNone(_create(description="   ").description)
        kept = _create(description="  Weekend rides  ")
        self.assertEqual(kept.description, "Weekend rides")
        self.assertEqual(_create(description="א" * CIRCLE_DESCRIPTION_MAX).description, "א" * CIRCLE_DESCRIPTION_MAX)
        with self.assertRaises(ValidationError):
            _create(description="B" * (CIRCLE_DESCRIPTION_MAX + 1))

    def test_overlong_name_is_rejected(self) -> None:
        ok = "A" * CIRCLE_NAME_MAX
        self.assertEqual(_create(name=f"  {ok}  ").name, ok)
        with self.assertRaises(ValidationError):
            _create(name="B" * (CIRCLE_NAME_MAX + 1))

    def test_patch_omitted_name_is_not_a_clear(self) -> None:
        omitted = CirclePatchRequest.model_validate({"inviteOnly": True})
        self.assertNotIn("name", omitted.model_fields_set)

        changed = CirclePatchRequest.model_validate({"name": "  Sunday Lake Riders  "})
        self.assertIn("name", changed.model_fields_set)
        self.assertEqual(changed.name, "Sunday Lake Riders")

        cleared = CirclePatchRequest.model_validate({"name": None})
        self.assertIn("name", cleared.model_fields_set)
        self.assertIsNone(cleared.name)

        blank = CirclePatchRequest.model_validate({"name": "   "})
        self.assertIn("name", blank.model_fields_set)
        self.assertIsNone(blank.name)

    def test_migration_is_nullable_without_unique_or_backfill(self) -> None:
        sql = (ROOT / "db" / "migrations" / "033_circle_name.sql").read_text(encoding="utf-8").upper()
        self.assertIn("ADD COLUMN IF NOT EXISTS NAME TEXT NULL", sql)
        self.assertNotIn("UNIQUE", sql)
        self.assertNotIn("UPDATE ", sql)
        self.assertNotIn("DEFAULT", sql)


if __name__ == "__main__":
    unittest.main()

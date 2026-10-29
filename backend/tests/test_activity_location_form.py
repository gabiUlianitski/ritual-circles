"""Activity create/edit uses the Circle place search without treating the city as a venue."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "src"
UI = WEB / "ui"


def _read(name: str) -> str:
    return (UI / name).read_text(encoding="utf-8")


class ActivityLocationFormTests(unittest.TestCase):
    def setUp(self) -> None:
        self.create = _read("CreateActivity.tsx")
        self.edit = _read("ActivityEdit.tsx")
        self.form = _read("ActivityFormFields.tsx")
        self.field = _read("ActivityLocationField.tsx")
        self.rules = _read("activityForm.ts")

    def test_new_activity_starts_from_the_circle_place_not_the_city(self) -> None:
        self.assertIn("initialActivityLocation", self.create)
        self.assertIn("meetingPlace: props.circle.meetingPlace", self.create)
        self.assertNotIn("setLocationName(defaults.cityName", self.create)
        self.assertNotIn("setLocationName(props.circle.cityName", self.create)
        init = self.rules.split("export function initialActivityLocation", 1)[1].split("export function activityIssues", 1)[0]
        self.assertIn("splitMeetingPlace", init)
        self.assertIn("onlyTheCity", init)
        self.assertIn("inherited: false", init)
        self.assertNotIn("location", self.rules.split("export function activityIssues", 1)[1].split("return issues", 1)[0])

    def test_search_reuses_place_autocomplete_scoped_to_the_circle_city(self) -> None:
        self.assertIn("PlaceAutocompleteField", self.field)
        self.assertIn('city={props.circleCity ?? ""}', self.form)
        self.assertIn("countryCode={props.countryCode}", self.form)
        self.assertIn("countryCode={countryCode}", self.create)
        self.assertNotIn("api.placeSuggest", self.field)
        self.assertNotIn("photon", self.field.lower())
        self.assertNotIn("nominatim", self.field.lower())
        self.assertNotIn("google", self.field.lower())
        self.assertNotIn("<iframe", self.field)
        self.assertNotIn("openstreetmap", self.field.lower())

    def test_select_change_remove_and_manual_entry_stay_on_the_activity(self) -> None:
        self.assertIn("onSelect={(place) => choose(place.name, place.address, place.category)}", self.field)
        self.assertIn("createCircle.placeKeep", self.field)
        remove = self.field.split("function remove()", 1)[1].split("return (", 1)[0]
        self.assertIn('locationName: ""', remove)
        self.assertNotIn("meetingPlace", remove)
        self.assertIn("activityForm.manualAction", self.field)
        self.assertIn("locationAddress: event.target.value", self.field)
        self.assertIn("create-location-details", self.field)
        self.assertIn("props.address.trim()", self.field)

    def test_edit_uses_the_activity_place_and_does_not_reinherit(self) -> None:
        self.assertIn("draftFromActivity(props.activity)", self.edit)
        self.assertIn("locationFromCircle={false}", self.edit)
        self.assertNotIn("getActivityDefaults", self.edit)
        self.assertNotIn("meetingPlace", self.edit)
        self.assertNotIn("activity_occurrences", self.field)
        self.assertNotIn("occurrence", self.field.lower())

    def test_inherited_label_is_only_the_starting_place(self) -> None:
        self.assertIn("locationFromCircle={locationFromCircle}", self.create)
        self.assertIn("useState(props.inherited)", self.field)
        choose = self.field.split("function choose(", 1)[1].split("function remove()", 1)[0]
        self.assertIn("setFromCircle(false)", choose)

    def test_locale_copy_exists_in_english_and_hebrew(self) -> None:
        for lang in ("en", "he"):
            activity = json.loads((WEB / "locales" / f"{lang}.json").read_text(encoding="utf-8"))["activityForm"]
            for key in (
                "where",
                "locationHelp",
                "locationLater",
                "locationEmpty",
                "locationCityContext",
                "fromCircle",
                "fromCircleA11y",
                "manualPrompt",
                "manualAction",
            ):
                self.assertTrue(activity.get(key), f"{lang}.{key}")
        en = json.loads((WEB / "locales" / "en.json").read_text(encoding="utf-8"))["activityForm"]
        self.assertEqual(en["where"], "Where will this Activity happen?")
        self.assertEqual(en["fromCircle"], "From this Circle")
        self.assertNotIn("Required", en["locationEmpty"])

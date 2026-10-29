"""Create Circle location step: city required, preferred place optional, no map/link workflow."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "src"
UI = WEB / "ui"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class CircleLocationStepTests(unittest.TestCase):
    def setUp(self) -> None:
        self.wizard = _read(UI / "CreateCircleWizard.tsx")
        self.step = _read(UI / "CreateCircleLocationStep.tsx")
        self.field = _read(UI / "PlaceAutocompleteField.tsx")
        self.display = _read(WEB / "venueCardDisplay.ts")

    def test_city_required_place_optional_and_next_works_without_place(self) -> None:
        self.assertIn("const step2Complete = Boolean(citySelected.trim());", self.wizard)
        self.assertNotIn("meetingPlace.trim())", self.wizard)
        self.assertIn("meetingPlace: place ? meetingPlaceFromPlace(place) : null", self.wizard)
        self.assertIn("cityName: citySelected.trim() || null", self.wizard)
        self.assertIn("createCircle.placeOptional", self.step)
        self.assertIn("createCircle.placeNone", self.step)

    def test_autocomplete_minimum_chars_abort_and_max_results(self) -> None:
        self.assertIn("PLACE_SEARCH_MIN_CHARS = 2", self.field)
        self.assertIn("PLACE_SEARCH_DEBOUNCE_MS = 300", self.field)
        self.assertIn("PLACE_SEARCH_MAX_RESULTS = 6", self.field)
        self.assertIn("abortRef.current?.abort()", self.field)
        self.assertIn("seq !== seqRef.current", self.field)
        self.assertIn("rows.slice(0, PLACE_SEARCH_MAX_RESULTS)", self.field)
        self.assertIn("api.placeSuggest", self.field)
        self.assertNotRegex(self.field, r"https?://")

    def test_combobox_semantics_and_keyboard(self) -> None:
        for token in (
            'role="combobox"',
            "aria-expanded",
            "aria-controls",
            "aria-activedescendant",
            'role="listbox"',
            'role="option"',
            'aria-live="polite"',
            '"Escape"',
            '"ArrowDown"',
            '"Enter"',
            "pointerdown",
            "placeSearch.clear",
        ):
            self.assertIn(token, self.field)

    def test_selecting_creates_selected_state_and_remove_clears_only_place(self) -> None:
        self.assertIn("placeFromSuggestion(row)", self.field)
        self.assertIn("placeFromVenue(venue", self.step)
        self.assertIn("create-location-selected", self.step)
        remove = self.step.split("function removePlace()", 1)[1].split("}", 1)[0]
        self.assertIn("props.onPlaceChange(null)", remove)
        self.assertNotIn("onCityQueryChange", remove)
        self.assertNotIn("onCitySelect", remove)
        self.assertIn('return [place.name, place.address].filter(Boolean).join(" — ");', self.display)

    def test_typing_hides_top_three_and_failures_stay_silent(self) -> None:
        self.assertIn("const TOP_SUGGESTIONS = 3;", self.step)
        self.assertIn("TOP_SUGGESTIONS_UI_MS = 1_500", self.step)
        self.assertIn("let accept = true;", self.step)
        self.assertIn("if (!accept || requestId !== topRequestRef.current || ac.signal.aborted) return;", self.step)
        self.assertIn("const showTop = showSearch && !searching && topVenues.length > 0;", self.step)
        self.assertIn("setPlaceQuery(\"\")", self.step)
        self.assertIn(".catch(() => {", self.step)
        self.assertNotIn("suggestedLoading", self.step)
        self.assertNotIn("FormError", self.step)
        self.assertNotIn("setError", self.step)
        change = self.step.split("setChangingPlace(true);", 1)[1].split("createCircle.placeChange", 1)[0]
        self.assertNotIn("onPlaceChange(null)", change)

    def test_city_change_clears_place_after_confirmation(self) -> None:
        change = self.step.split("function changeCity()", 1)[1].split("\n  }\n", 1)[0]
        self.assertIn("createCircle.cityChangeConfirm", change)
        self.assertIn("props.onPlaceChange(null)", change)
        on_city = self.wizard.split("function onCitySelect(", 1)[1].split("\n  }\n", 1)[0]
        self.assertIn("setPlace(null)", on_city)

    def test_address_hidden_by_default_and_details_reveals_it(self) -> None:
        self.assertIn("useState(false);\n  const [topVenues", self.step)
        self.assertIn("showDetails && props.place.address", self.step)
        self.assertIn("createCircle.placeDetails", self.step)
        self.assertNotIn("fullAddress", self.field.split("function secondaryLine", 1)[1].split("}", 1)[0])

    def test_old_map_link_and_location_workflow_is_gone(self) -> None:
        sources = self.wizard + self.step + self.field
        for removed in (
            "CreateCircleVenuePicker",
            "geolocation",
            "reverseLocate",
            "resolveMapsLink",
            "buildOsmMapEmbedUrl",
            "openstreetmap",
            "Paste Google Maps link",
            "createCircle.useLocation",
            "createCircle.placeAssist",
            "createCircle.viewOnMap",
            "<iframe",
        ):
            self.assertNotIn(removed, sources)
        picker = _read(UI / "CreateCircleVenuePicker.tsx")
        self.assertNotIn("guided", picker)

    def test_locales_have_the_new_copy_in_both_languages(self) -> None:
        for lang in ("en", "he"):
            data = json.loads(_read(WEB / "locales" / f"{lang}.json"))
            create = data["createCircle"]
            for key in (
                "locationTitle",
                "locationHelp",
                "placeTitle",
                "placeOptional",
                "placeHelp",
                "placeHelpMore",
                "placeNone",
                "placeNoneMore",
                "cityChangeConfirm",
            ):
                self.assertTrue(create.get(key), f"{lang}.createCircle.{key}")
            activity = data["activityForm"]
            self.assertTrue(activity.get("locationEmpty"))
            self.assertTrue(activity.get("locationCityContext"))
            search = data["placeSearch"]
            for key in ("placeholder", "noResults", "tryAnother", "unavailable", "clear"):
                self.assertTrue(search.get(key), f"{lang}.placeSearch.{key}")
            for key in ("city", "sports", "park", "cafe", "community", "transit", "generic"):
                self.assertTrue(search["category"].get(key))
            location_keys = [k for k in create if k.startswith(("location", "place", "suggested", "city"))]
            blob = " ".join(str(create[k]) for k in location_keys) + json.dumps(search, ensure_ascii=False)
            for word in ("Required", "Missing", "No locations configured"):
                self.assertNotIn(word, blob)
        en = json.loads(_read(WEB / "locales" / "en.json"))
        self.assertEqual(en["createCircle"]["locationTitle"], "Where is your Circle based?")
        self.assertEqual(en["createCircle"]["placeHelp"], "Add a place your Circle often uses.")
        self.assertEqual(en["createCircle"]["placeNone"], "No preferred place? That’s fine.")
        self.assertEqual(en["activityForm"]["locationEmpty"], "Location not selected yet")
        form = _read(UI / "ActivityFormFields.tsx")
        location = _read(UI / "ActivityLocationField.tsx")
        create = _read(UI / "CreateActivity.tsx")
        self.assertIn("activityForm.locationEmpty", location)
        self.assertIn("activityForm.locationCityContext", form)
        self.assertIn("defaults.cityName", create)
        self.assertNotIn("setLocationName(defaults.cityName", create)
        defaults = (ROOT / "backend" / "app" / "services" / "circle_activity_defaults.py").read_text(encoding="utf-8")
        returned = defaults.split("if place_name:", 1)[1]
        self.assertIn("return None, None", returned)
        self.assertNotIn("return _text(city_name)", returned)
        self.assertEqual(
            en["placeSearch"]["unavailable"],
            "Place search is unavailable right now. You can continue and choose a place later.",
        )
        self.assertTrue(re.search(r"[\u0590-\u05FF]", json.loads(_read(WEB / "locales" / "he.json"))["createCircle"]["placeTitle"]))

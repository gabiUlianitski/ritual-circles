"""Place autocomplete for the Circle location step: Photon first, Nominatim fallback, normalized output."""

from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest import mock
from uuid import UUID

import asyncpg
import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

from app.routers import geo
from app.schemas import CircleCreateRequest, PlaceSuggestion
from app.services import place_suggest as ps
from app.services import venue_suggestions as vs
from app.services.circles_service import create_circle

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "backend" / "app" / "services" / "place_suggest.py"
PLACE_KEYS = {
    "kind",
    "category",
    "name",
    "cityName",
    "countryCode",
    "countryName",
    "shortAddress",
    "fullAddress",
    "latitude",
    "longitude",
}


def _photon(
    name: str,
    *,
    city: str = "Rishon LeZion",
    country: str = "Israel",
    cc: str = "IL",
    key: str = "leisure",
    value: str = "park",
    street: str | None = "Herzl",
    housenumber: str | None = "12",
    typ: str = "house",
) -> dict:
    props = {
        "name": name,
        "city": city,
        "country": country,
        "countrycode": cc,
        "osm_key": key,
        "osm_value": value,
        "type": typ,
        "osm_id": 123,
        "extent": [1, 2, 3, 4],
    }
    if street:
        props["street"] = street
    if housenumber:
        props["housenumber"] = housenumber
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [34.8, 31.96]}, "properties": props}


def _nominatim(name: str, *, city: str = "Rishon LeZion") -> dict:
    return {
        "place_id": 99,
        "licence": "ODbL",
        "class": "amenity",
        "type": "cafe",
        "name": name,
        "display_name": f"{name}, Rothschild, {city}, Israel",
        "lat": "31.96",
        "lon": "34.80",
        "address": {"road": "Rothschild", "house_number": "5", "city": city, "country": "Israel", "country_code": "il"},
    }


class PlaceSuggestServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        ps._CACHE.clear()

    async def _run(self, photon=None, nominatim=None, **kwargs):
        photon_mock = mock.AsyncMock(**({"side_effect": photon} if isinstance(photon, Exception) else {"return_value": photon or []}))
        nominatim_mock = mock.AsyncMock(
            **({"side_effect": nominatim} if isinstance(nominatim, Exception) else {"return_value": nominatim or []})
        )
        args = {"query": "park", "city": "Rishon LeZion", "country_code": "IL"}
        args.update(kwargs)
        with mock.patch.object(ps, "_photon_place_search", photon_mock), mock.patch.object(
            ps, "_nominatim_place_search", nominatim_mock
        ):
            out = await ps.place_suggest(**args)
        return out, photon_mock, nominatim_mock

    async def test_a_results_are_normalized(self) -> None:
        out, _, _ = await self._run(photon=[_photon("Yes Planet Park")])
        self.assertEqual(len(out), 1)
        place = out[0]
        self.assertEqual(set(place), PLACE_KEYS)
        self.assertEqual(place["kind"], "place")
        self.assertEqual(place["category"], "park")
        self.assertEqual(place["name"], "Yes Planet Park")
        self.assertEqual(place["shortAddress"], "Herzl 12, Rishon LeZion")
        self.assertIn("Israel", place["fullAddress"])
        PlaceSuggestion(**place)

    async def test_b_city_and_country_come_from_photon(self) -> None:
        out, _, _ = await self._run(photon=[_photon("Cafe Joe", key="amenity", value="cafe")])
        self.assertEqual(out[0]["cityName"], "Rishon LeZion")
        self.assertEqual(out[0]["countryCode"], "IL")
        self.assertEqual(out[0]["countryName"], "Israel")
        self.assertEqual(out[0]["category"], "cafe")

    async def test_c_photon_is_primary(self) -> None:
        out, photon, nominatim = await self._run(photon=[_photon("Park A")], nominatim=[_nominatim("Other")])
        photon.assert_awaited_once()
        nominatim.assert_not_awaited()
        self.assertEqual([p["name"] for p in out], ["Park A"])

    async def test_d_nominatim_is_only_a_fallback(self) -> None:
        out, _, nominatim = await self._run(photon=[], nominatim=[_nominatim("Cafe Fallback")])
        nominatim.assert_awaited_once()
        self.assertEqual(out[0]["name"], "Cafe Fallback")
        self.assertEqual(out[0]["category"], "cafe")
        self.assertEqual(out[0]["cityName"], "Rishon LeZion")

        ps._CACHE.clear()
        out, _, nominatim = await self._run(photon=httpx.ConnectError("down"), nominatim=[_nominatim("Cafe B")])
        nominatim.assert_awaited_once()
        self.assertEqual(out[0]["name"], "Cafe B")

        ps._CACHE.clear()
        out, _, nominatim = await self._run(photon=[_photon("Rishon LeZion", key="place", value="city", typ="city")], nominatim=[])
        nominatim.assert_awaited_once()
        self.assertEqual(out, [])

    async def test_e_no_google_key_is_required(self) -> None:
        with mock.patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": ""}), mock.patch(
            "app.services.maps_config.load_google_maps_config", side_effect=AssertionError("google not allowed")
        ):
            out, _, _ = await self._run(photon=[_photon("Park")])
        self.assertEqual(len(out), 1)
        source = SERVICE.read_text(encoding="utf-8").lower()
        self.assertNotIn("google", source)
        self.assertNotIn("overpass", source)

    async def test_f_g_selected_city_ranks_first_and_other_cities_below(self) -> None:
        rows = [
            _photon("Park Holon", city="Holon"),
            _photon("Park Rishon", city="Rishon LeZion"),
            _photon("Park Paris", city="Paris", country="France", cc="FR"),
        ]
        out, _, _ = await self._run(photon=rows)
        self.assertEqual([p["name"] for p in out], ["Park Rishon", "Park Holon"])

    async def test_h_limit_is_enforced(self) -> None:
        rows = [_photon(f"Park {i}") for i in range(15)]
        out, _, _ = await self._run(photon=rows)
        self.assertEqual(len(out), ps.PLACE_SUGGEST_MAX_LIMIT)
        self.assertEqual(ps.PLACE_SUGGEST_MAX_LIMIT, 6)
        ps._CACHE.clear()
        out, _, _ = await self._run(photon=rows, limit=3)
        self.assertEqual(len(out), 3)
        ps._CACHE.clear()
        out, _, _ = await self._run(photon=rows, limit=50)
        self.assertEqual(len(out), 6)

    async def test_i_no_raw_provider_payload(self) -> None:
        out, _, _ = await self._run(photon=[_photon("Park")])
        self.assertNotIn("osm_id", out[0])
        self.assertNotIn("extent", out[0])
        self.assertNotIn("properties", out[0])
        ps._CACHE.clear()
        out, _, _ = await self._run(photon=[], nominatim=[_nominatim("Cafe")])
        for raw_key in ("place_id", "licence", "display_name", "address", "class"):
            self.assertNotIn(raw_key, out[0])

    async def test_j_provider_errors_are_safe(self) -> None:
        with self.assertRaises(ps.PlaceSearchUnavailable):
            await self._run(photon=httpx.ConnectError("down"), nominatim=httpx.ReadTimeout("slow"))
        ps._CACHE.clear()
        out, _, _ = await self._run(photon=[], nominatim=httpx.ReadTimeout("slow"))
        self.assertEqual(out, [])

    async def test_k_cache_avoids_repeat_provider_calls(self) -> None:
        photon = mock.AsyncMock(return_value=[_photon("Park")])
        with mock.patch.object(ps, "_photon_place_search", photon), mock.patch.object(
            ps, "_nominatim_place_search", mock.AsyncMock(return_value=[])
        ):
            first = await ps.place_suggest(query="Park", city="Rishon LeZion", country_code="IL")
            second = await ps.place_suggest(query="park ", city="rishon lezion", country_code="il")
        self.assertEqual(first, second)
        photon.assert_awaited_once()

    async def test_o_route_hides_keys_and_provider_errors(self) -> None:
        secret = "https://photon.komoot.io/api/?key=SECRET-123 Traceback"
        with mock.patch.object(ps, "_photon_place_search", mock.AsyncMock(side_effect=httpx.ConnectError(secret))), mock.patch.object(
            ps, "_nominatim_place_search", mock.AsyncMock(side_effect=RuntimeError(secret))
        ), mock.patch.object(geo, "place_suggest", ps.place_suggest):
            with self.assertRaises(HTTPException) as ctx:
                await geo.place_suggest_route(q="park", city="Rishon LeZion", country="IL", limit=6, lat=None, lon=None, _=None)
        self.assertEqual(ctx.exception.status_code, 503)
        detail = str(ctx.exception.detail)
        self.assertNotIn("SECRET", detail)
        self.assertNotIn("http", detail)
        self.assertNotIn("Traceback", detail)
        self.assertNotIn("komoot", detail)

        with mock.patch.object(ps, "_photon_place_search", mock.AsyncMock(return_value=[_photon("Park X")])):
            ps._CACHE.clear()
            rows = await geo.place_suggest_route(q="park", city="Rishon LeZion", country="IL", limit=6, lat=None, lon=None, _=None)
        self.assertEqual(set(rows[0].model_dump()), PLACE_KEYS)


class PlaceSuggestRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_l_city_autocomplete_is_unchanged(self) -> None:
        paths = {getattr(r, "path", "") for r in geo.router.routes}
        self.assertIn("/geo/city-suggest", paths)
        self.assertIn("/geo/place-suggest", paths)
        rows = [{"shortName": "Rishon LeZion", "displayName": "Rishon LeZion, Israel", "lat": 31.9, "lon": 34.8, "countryCode": "IL"}]
        with mock.patch.object(geo, "nominatim_city_suggest", mock.AsyncMock(return_value=rows)) as city:
            out = await geo.city_suggest(q="Rish", country="IL")
        city.assert_awaited_once_with(query="Rish", country_code="IL", limit=10)
        self.assertEqual(out[0].shortName, "Rishon LeZion")
        self.assertNotIn("nominatim_city_suggest", SERVICE.read_text(encoding="utf-8"))

    async def test_m_venue_suggestions_cached_and_categorized_for_top_three(self) -> None:
        vs._VENUE_CACHE.clear()
        result = ([{"name": "Park", "address": "Herzl 1", "placeCategory": "park"}], "Rishon LeZion, Israel", 31.9, 34.8)
        uncached = mock.AsyncMock(return_value=result)
        with mock.patch.object(vs, "_suggest_venues_uncached", uncached):
            first = await vs.suggest_venues_near_address(
                address="Rishon LeZion, Israel", ritual_type="bicycle", ritual_subtype="gravel", country_code="IL"
            )
            second = await vs.suggest_venues_near_address(
                address="  rishon   lezion, israel ",
                ritual_type="Bicycle",
                ritual_subtype=" Gravel ",
                ritual_level=1,
                country_code="il",
            )
            third = await vs.suggest_venues_near_address(
                address="Rishon LeZion, Israel",
                ritual_type="bicycle",
                ritual_subtype="gravel",
                ritual_level=4,
                country_code="IL",
            )
            await vs.suggest_venues_near_address(
                address="Rishon LeZion, Israel", ritual_type="bicycle", ritual_subtype="gravel", country_code="US"
            )
            await vs.suggest_venues_near_address(address="Holon, Israel", ritual_type="bicycle", ritual_subtype="gravel")
        self.assertEqual(first, second)
        self.assertEqual(second, third)
        self.assertEqual(uncached.await_count, 3)
        self.assertGreaterEqual(vs._VENUE_CACHE_TTL_S, 12 * 3600)
        self.assertLessEqual(vs._VENUE_CACHE_TTL_S, 24 * 3600)

        cards = await vs._finalize_candidates(
            [
                {"name": "Yarkon Park", "address": "Tel Aviv", "_tags": {"leisure": "park"}},
                {"name": "Coffee Bar", "address": "Herzl 1", "types": ["cafe"]},
            ],
            ritual_type="bicycle",
            ritual_subtype=None,
            ritual_level=None,
            near_label="Rishon LeZion, Israel",
        )
        self.assertEqual([c["placeCategory"] for c in cards], ["park", "cafe"])
        vs._VENUE_CACHE.clear()


class CircleCreateWithoutPlaceTests(unittest.IsolatedAsyncioTestCase):
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
        self.user_id: UUID = await self.conn.fetchval("SELECT id FROM users ORDER BY id LIMIT 1")
        self.slug = await self.conn.fetchval("SELECT slug FROM hobies ORDER BY slug LIMIT 1")
        if not self.user_id or not self.slug:
            self.skipTest("need a user and a hobby")

    async def asyncTearDown(self) -> None:
        if getattr(self, "tx", None) is not None:
            await self.tx.rollback()
        if getattr(self, "conn", None) is not None:
            await self.conn.close()

    async def _legacy_counts(self) -> tuple[int, int]:
        sessions = await self.conn.fetchval("SELECT COUNT(*)::int FROM sessions")
        attendance = await self.conn.fetchval("SELECT COUNT(*)::int FROM attendance")
        return int(sessions), int(attendance)

    async def _create(self, **extra: object):
        payload = {
            "ritualType": self.slug,
            "modality": "offline",
            "recurringTime": "Sat 10:00",
            "countryCode": "IL",
            "cityName": "Rishon LeZion, Central District, Israel",
        }
        payload.update(extra)
        return await create_circle(self.conn, user_id=self.user_id, payload=CircleCreateRequest.model_validate(payload))

    async def test_n_city_only_circle_stores_no_place_and_no_legacy_rows(self) -> None:
        before = await self._legacy_counts()
        circle = await self._create(meetingPlace=None)
        row = await self.conn.fetchrow(
            "SELECT city_name, country_code, meeting_place FROM circles WHERE id = $1", UUID(circle.id)
        )
        self.assertIsNone(row["meeting_place"])
        self.assertEqual(row["city_name"], "Rishon LeZion, Central District, Israel")
        self.assertEqual(row["country_code"], "IL")
        self.assertIsNone(circle.meetingPlace)
        self.assertEqual(circle.city, "Rishon LeZion, Central District, Israel")
        self.assertEqual(await self._legacy_counts(), before)

    async def test_place_is_stored_as_name_and_address(self) -> None:
        circle = await self._create(meetingPlace="Yes Planet Park — Herzl 12, Rishon LeZion")
        stored = await self.conn.fetchval("SELECT meeting_place FROM circles WHERE id = $1", UUID(circle.id))
        self.assertEqual(stored, "Yes Planet Park — Herzl 12, Rishon LeZion")

    async def test_offline_circle_still_needs_a_city(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            await self._create(cityName=None, meetingPlace=None)
        self.assertEqual(ctx.exception.status_code, 400)

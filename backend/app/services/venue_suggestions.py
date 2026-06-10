from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.services.google_places import geocode_address, place_to_candidate, places_text_search
from app.services.maps_config import GoogleMapsConfig, load_google_maps_config
from app.services.osm_venues import (
    _haversine_m,
    dedupe_osm_near_duplicates,
    fill_osm_rows_missing_addresses,
    geocode_address_with_fallback,
    nominatim_venue_search_fallback,
    overpass_venues_near,
    tennis_surface_request_bucket,
)
from app.services.venue_display import venue_card_fields
from app.services.venue_hoby_blurb import google_hoby_relation, osm_hoby_relation

logger = logging.getLogger(__name__)

_MAX_SEARCH_RADIUS_M = 28_000
_OVERPASS_CALL_TIMEOUT_S = 55.0
_GEOCODE_TIMEOUT_S = 18.0
_OSM_GATHER_TIMEOUT_S = 65.0
_OSM_TOTAL_TIMEOUT_S = 85.0
_NOMINATIM_ONLY_TIMEOUT_S = 22.0


def _candidate_pos_key(c: dict[str, Any]) -> tuple:
    try:
        return (
            round(float(c.get("_lat", 0)), 4),
            round(float(c.get("_lon", 0)), 4),
            (str(c.get("name") or "").strip().lower()),
        )
    except (TypeError, ValueError):
        return (0.0, 0.0, str(c.get("name") or "").lower())


def _merge_osm_candidates(existing: list[dict[str, Any]], new: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = {_candidate_pos_key(c) for c in existing}
    out = list(existing)
    for c in new:
        k = _candidate_pos_key(c)
        if k in seen:
            continue
        seen.add(k)
        out.append(c)
    out.sort(key=lambda x: float(x.get("_dist_m") or 1e12))
    return dedupe_osm_near_duplicates(out)


def _initial_radius_m(slug: str) -> int:
    if slug == "bicycle":
        return 10_000
    if slug == "tennis":
        return 15_000
    return 9_000


async def _overpass_try(
    *,
    lat: float,
    lon: float,
    slug: str,
    radius_m: int,
    ritual_subtype: str | None,
    ritual_level: int | None,
) -> list[dict[str, Any]]:
    """One Overpass query with a hard cap — avoids hanging on busy public servers."""
    try:
        batch, _reached = await asyncio.wait_for(
            overpass_venues_near(
                lat=lat,
                lon=lon,
                ritual_type_slug=slug,
                radius_m=radius_m,
                ritual_subtype=ritual_subtype,
                ritual_level=ritual_level,
                fill_addresses=False,
                max_mirrors=2,
            ),
            timeout=_OVERPASS_CALL_TIMEOUT_S,
        )
    except TimeoutError:
        logger.warning(
            "overpass_call_timeout",
            extra={"slug": slug, "radius_m": radius_m, "timeout_s": _OVERPASS_CALL_TIMEOUT_S},
        )
        return []
    return batch


def _last_resort_places(
    *,
    lat: float,
    lon: float,
    near_label: str,
    ritual_type: str,
) -> list[dict[str, Any]]:
    """When map servers fail, still return a shareable meetup pin in the city area."""
    city = near_label.split(",")[0].strip() or near_label
    maps = f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=15/{lat}/{lon}"
    return [
        {
            "name": f"Meet in {city} (city area)",
            "address": near_label,
            "mapsUrl": maps,
            "hobyRelation": (
                f"Map data was slow or unavailable — use this as a starting point for your {ritual_type} meetup."
            ),
            "_dist_m": 0.0,
            "_lat": lat,
            "_lon": lon,
            "_tags": {},
        }
    ]


def _city_from_near_label(near_label: str) -> str:
    return near_label.split(",")[0].strip()


# Other municipalities in central Israel — used to drop wrong-city suggestions.
_CITY_ALIAS_GROUPS: tuple[tuple[str, ...], ...] = (
    ("rishon lezion", "rishon le zion", "ראשון לציון"),
    ("raanana", "ra'anana", "רעננה"),
    ("holon", "חולון"),
    ("bat yam", "בת ים"),
    ("or yehuda", "אור יהודה"),
    ("herzliya", "herzliyya", "הרצליה"),
    ("kfar saba", "כפר סבא"),
    ("hod hasharon", "הוד השרון"),
    ("petah tikva", "פתח תקווה"),
    ("ramat gan", "רמת גן"),
    ("tel aviv", "tel aviv-yafo", "תל אביב", "תל אביב-יפו"),
    ("even yehuda", "אבן יהודה"),
    ("yehud", "יהוד", "yehud-monosson", "יהוד-מונוסון"),
)

_MAX_VENUE_DIST_M = 18_000


def _city_match_tokens(city: str) -> tuple[str, ...]:
    base = city.strip().lower().replace("-", " ")
    if not base:
        return ()
    tokens = {base, city.strip().lower()}
    for group in _CITY_ALIAS_GROUPS:
        if any(base in g or g in base for g in group):
            tokens.update(group)
            break
    return tuple(tokens)


def _venue_names_other_city(blob: str, target_city: str) -> bool:
    """True when address names another municipality and not the searched city."""
    target_tokens = {t.lower() for t in _city_match_tokens(target_city)}
    blob_lower = blob.lower()
    has_target = any(tok in blob_lower for tok in target_tokens)
    if has_target:
        return False
    for group in _CITY_ALIAS_GROUPS:
        if any(tok in target_tokens for tok in group):
            continue
        if any(alias.lower() in blob_lower for alias in group):
            return True
    return False


def _venue_in_target_city(candidate: dict[str, Any], city: str) -> bool:
    if not city.strip():
        return False
    blob = f"{candidate.get('address') or ''} {candidate.get('name') or ''}"
    if _venue_names_other_city(blob, city):
        return False
    return any(tok in blob.lower() for tok in _city_match_tokens(city))


def _filter_for_search_city(merged: list[dict[str, Any]], near_label: str) -> list[dict[str, Any]]:
    """Keep nearby venues in the searched city; drop far / wrong-city rows."""
    city = _city_from_near_label(near_label)
    kept: list[dict[str, Any]] = []
    for c in merged:
        try:
            dist_m = float(c.get("_dist_m") or 0)
        except (TypeError, ValueError):
            dist_m = 0.0
        if dist_m > _MAX_VENUE_DIST_M:
            continue
        blob = f"{c.get('address') or ''} {c.get('name') or ''}"
        if city and _venue_names_other_city(blob, city):
            continue
        kept.append(c)

    if not city:
        kept.sort(key=lambda x: float(x.get("_dist_m") or 1e12))
        return kept

    in_city = [c for c in kept if _venue_in_target_city(c, city)]
    near_city = [c for c in kept if not _venue_in_target_city(c, city)]
    in_city.sort(key=lambda x: float(x.get("_dist_m") or 1e12))
    near_city.sort(key=lambda x: float(x.get("_dist_m") or 1e12))
    return in_city + near_city


def _sort_venues_city_first(merged: list[dict[str, Any]], near_label: str) -> list[dict[str, Any]]:
    return _filter_for_search_city(merged, near_label)


async def _gather_osm_near(
    *,
    lat: float,
    lon: float,
    slug: str,
    ritual_subtype: str | None,
    ritual_level: int | None,
    near_label: str,
) -> list[dict[str, Any]]:
    """Overpass + Nominatim in parallel; skip slow Overpass when Nominatim is enough."""
    city_label = _city_from_near_label(near_label)
    merged: list[dict[str, Any]] = []

    overpass_task = asyncio.create_task(
        _overpass_try(
            lat=lat,
            lon=lon,
            slug=slug,
            radius_m=6_000,
            ritual_subtype=ritual_subtype,
            ritual_level=ritual_level,
        )
    )
    nominatim_task = asyncio.create_task(
        nominatim_venue_search_fallback(
            lat=lat,
            lon=lon,
            ritual_type_slug=slug,
            ritual_subtype=ritual_subtype,
            city_label=city_label or None,
            near_label=near_label,
            max_queries=4,
        )
    )

    done, pending = await asyncio.wait(
        {overpass_task, nominatim_task},
        return_when=asyncio.FIRST_COMPLETED,
    )

    fb: list[dict[str, Any]] = []
    if nominatim_task in done:
        fb = nominatim_task.result() or []
        if len(fb) >= 3:
            overpass_task.cancel()
            try:
                await overpass_task
            except asyncio.CancelledError:
                pass
            merged = _sort_venues_city_first(list(fb), near_label)
            await fill_osm_rows_missing_addresses(merged, max_reverse=1)
            return merged

    if pending:
        await asyncio.wait(pending)

    fb = nominatim_task.result() or []
    overpass_batch: list[dict[str, Any]] = []
    if overpass_task.done():
        try:
            overpass_batch = overpass_task.result() or []
        except asyncio.CancelledError:
            overpass_batch = []
    else:
        overpass_batch = await overpass_task
    if fb:
        merged = _merge_osm_candidates(merged, fb)
    if overpass_batch:
        merged = _merge_osm_candidates(merged, overpass_batch)

    if len(merged) >= 3:
        merged = _sort_venues_city_first(merged, near_label)
        await fill_osm_rows_missing_addresses(merged, max_reverse=1)
        return merged

    if len(merged) >= 2:
        if slug == "tennis" and merged:
            filtered = _filter_tennis_activity_venues(merged)
            if filtered:
                merged = filtered
            merged.sort(key=lambda x: float(x.get("_dist_m") or 1e12))
        merged = _sort_venues_city_first(merged, near_label)
        await fill_osm_rows_missing_addresses(merged, max_reverse=1)
        return merged

    if overpass_batch and len(merged) < 3:
        batch = await _overpass_try(
            lat=lat,
            lon=lon,
            slug=slug,
            radius_m=min(_initial_radius_m(slug), 12_000),
            ritual_subtype=ritual_subtype,
            ritual_level=ritual_level,
        )
        if batch:
            merged = _merge_osm_candidates(merged, batch)

    if overpass_batch and len(merged) < 2 and slug != "default":
        batch = await _overpass_try(
            lat=lat,
            lon=lon,
            slug="default",
            radius_m=14_000,
            ritual_subtype=None,
            ritual_level=ritual_level,
        )
        if batch:
            merged = _merge_osm_candidates(merged, batch)

    if len(merged) < 2 and not fb:
        fb_retry = await nominatim_venue_search_fallback(
            lat=lat,
            lon=lon,
            ritual_type_slug=slug,
            ritual_subtype=ritual_subtype,
            city_label=city_label or None,
            near_label=near_label,
            max_queries=3,
        )
        if fb_retry:
            merged = _merge_osm_candidates(merged, fb_retry)

    if slug == "tennis" and merged:
        filtered = _filter_tennis_activity_venues(merged)
        if filtered:
            merged = filtered
        merged.sort(key=lambda x: float(x.get("_dist_m") or 1e12))

    if merged:
        merged = _sort_venues_city_first(merged, near_label)
        await fill_osm_rows_missing_addresses(merged, max_reverse=1)
    return merged

# Text-search phrases biased toward in-person recurring meetups (not exhaustive).
_PLACE_QUERIES: dict[str, list[str]] = {
    "bicycle": ["bicycle trail", "bike path", "cycling route", "bike park"],
    "tennis": ["tennis court", "tennis club", "public tennis"],
    "chess": ["coffee shop", "library", "community center"],
    "coffee": ["coffee shop", "cafe"],
    "cooking": ["cooking class kitchen", "community kitchen"],
    "dancing": ["dance studio", "community center dance"],
}


_GOOGLE_CLAY_POS = (
    "clay",
    "terre battue",
    "terre-battue",
    "red clay",
    "claycourt",
    "clay court",
    "clay-court",
    "courts de terre",
    "טניס חימר",
    "מגרש חימר",
    "חימר",
)
_GOOGLE_HARD_NEG = (
    "hard court",
    "hard-court",
    "acrylic",
    "decoturf",
    "artificial turf",
    "astro turf",
    "astroturf",
    "paddle tennis",
    "pickleball",
    "synthetic court",
    "שטיח",  # carpet / synthetic colloquial in some locales
)


def filter_google_places_tennis_surface(
    candidates: list[dict[str, Any]],
    ritual_type: str,
    ritual_subtype: str | None,
) -> list[dict[str, Any]]:
    """Google Places does not expose court surface; keep only rows whose text clearly matches the subtype."""
    if ritual_type.strip().lower() != "tennis":
        return candidates
    want = tennis_surface_request_bucket(ritual_subtype)
    if want is None:
        return candidates

    out: list[dict[str, Any]] = []
    for c in candidates:
        name = str(c.get("name") or "")
        addr = str(c.get("address") or "")
        blob = f"{name} {addr}".lower()
        types = [str(t).lower() for t in (c.get("types") or []) if isinstance(t, str)]
        type_blob = " ".join(types)

        if want == "clay":
            if any(h in blob for h in _GOOGLE_HARD_NEG):
                continue
            if any(h in type_blob for h in ("pickleball",)):
                continue
            if any(p in blob for p in _GOOGLE_CLAY_POS):
                out.append(c)
            continue

        if want == "grass":
            if any(x in blob for x in ("clay", "hard court", "acrylic", "asphalt", "hard-court", "terre battue")):
                continue
            if any(
                p in blob
                for p in (
                    "grass court",
                    "grasscourt",
                    "lawn tennis",
                    "grass tennis",
                    "דשא",
                    "מדשאה",
                )
            ):
                out.append(c)
            continue

        if want == "hard":
            if any(x in blob for x in ("clay court", "grass court", "terre battue", "grasscourt", "claycourt")):
                continue
            if any(
                p in blob
                for p in (
                    "hard court",
                    "hard-court",
                    "acrylic",
                    "synthetic",
                    "asphalt",
                    "decoturf",
                    "שטיח",
                )
            ):
                out.append(c)
            continue

        if want == "indoor":
            if any(
                p in blob
                for p in (
                    "indoor tennis",
                    "indoor court",
                    "covered court",
                    "bubble",
                    "tennis hall",
                    "אולם",
                    "מקורה",
                )
            ):
                out.append(c)
            continue

    return out


def _queries_for(ritual_type: str, ritual_subtype: str | None) -> list[str]:
    slug = ritual_type.strip().lower()
    base = list(_PLACE_QUERIES.get(slug, ["park", "community center", "sports facility", "recreation center"]))
    if slug == "tennis" and ritual_subtype and ritual_subtype.strip():
        su = ritual_subtype.strip().lower().replace(" ", "_").replace("-", "_")
        extras: list[str] = []
        if any(k in su for k in ("clay", "clay_court", "red_clay")):
            extras = ["clay tennis court", "red clay tennis club"]
        elif any(k in su for k in ("grass", "grass_court", "lawn")):
            extras = ["grass tennis court", "lawn tennis club"]
        elif any(k in su for k in ("hard", "hard_court", "synthetic")):
            extras = ["hard tennis court", "outdoor hard tennis court"]
        if extras:
            base = extras + base
    if ritual_subtype and ritual_subtype.strip():
        sub = ritual_subtype.strip().replace("_", " ")
        base = [f"{sub} {q}" for q in base[:2]] + base
    seen: set[str] = set()
    out: list[str] = []
    for q in base:
        k = q.lower()
        if k not in seen:
            seen.add(k)
            out.append(q)
    return out[:5]


async def _ai_pick_indices(
    candidates: list[dict[str, Any]],
    *,
    ritual_type: str,
    ritual_subtype: str | None,
    ritual_level: int | None,
    near_label: str,
) -> list[int] | None:
    # V1: skip LLM re-rank — saves latency; closest-by-distance order is enough.
    _ = (candidates, ritual_type, ritual_subtype, ritual_level, near_label)
    return None


async def _finalize_candidates(
    merged: list[dict[str, Any]],
    *,
    ritual_type: str,
    ritual_subtype: str | None,
    ritual_level: int | None,
    near_label: str,
) -> list[dict[str, Any]]:
    picked_idx = await _ai_pick_indices(
        merged,
        ritual_type=ritual_type,
        ritual_subtype=ritual_subtype,
        ritual_level=ritual_level,
        near_label=near_label,
    )
    if picked_idx:
        ordered = [merged[i] for i in picked_idx if 0 <= i < len(merged)]
        if ordered:
            merged = ordered
    out: list[dict[str, Any]] = []
    seen_display: set[str] = set()
    for c in merged:
        if len(out) >= 8:
            break
        name = str(c.get("name") or "").strip() or "Venue"
        addr = str(c.get("address") or "").strip()
        tags_fb = c.get("_tags") if isinstance(c.get("_tags"), dict) else {}
        types_raw = c.get("types")
        types_list = [str(t) for t in types_raw] if isinstance(types_raw, list) else []
        try:
            dist_m_raw = c.get("_dist_m")
            dist_m = float(dist_m_raw) if dist_m_raw is not None else None
        except (TypeError, ValueError):
            dist_m = None
        lat_raw = c.get("_lat")
        lon_raw = c.get("_lon")
        try:
            lat = float(lat_raw) if lat_raw is not None else None
            lon = float(lon_raw) if lon_raw is not None else None
        except (TypeError, ValueError):
            lat, lon = None, None

        card = venue_card_fields(
            name=name,
            address=addr,
            dist_m=dist_m,
            tags=tags_fb,
            google_types=types_list or None,
        )
        display_key = card["displayName"].strip().lower()
        if display_key in seen_display:
            continue
        seen_display.add(display_key)

        hr = str(c.get("hobyRelation") or "").strip()
        if not hr:
            if types_list:
                hr = google_hoby_relation(ritual_type, ritual_subtype, types_list)
            else:
                hr = osm_hoby_relation(
                    ritual_type,
                    ritual_subtype,
                    tags_fb,
                    venue_name=name,
                    dist_m=dist_m,
                    ritual_level=ritual_level,
                    surface_match=str(c.get("_tennis_surface_match") or "") or None,
                )

        out.append(
            {
                "name": name,
                "address": addr,
                "hobyRelation": hr,
                "mapsUrl": c.get("mapsUrl"),
                **card,
                "lat": lat,
                "lon": lon,
            }
        )
    return out


async def _suggest_google(
    *,
    address: str,
    ritual_type: str,
    ritual_subtype: str | None,
    ritual_level: int | None,
    cfg: GoogleMapsConfig,
) -> tuple[list[dict[str, Any]], str | None]:
    geo = await geocode_address(cfg, address=address)
    if not geo:
        raise ValueError("Could not find that address. Try a fuller street address or city.")

    lat, lng = geo["lat"], geo["lng"]
    near_label = str(geo.get("formatted_address") or address.strip())

    seen_pid: set[str] = set()
    merged: list[dict[str, Any]] = []

    for q in _queries_for(ritual_type, ritual_subtype)[:2]:
        text_q = f"{q} near {near_label}"
        places = await places_text_search(cfg, query=text_q, lat=lat, lng=lng)
        for p in places:
            cand = place_to_candidate(p)
            if not cand:
                continue
            pid = cand.get("placeId")
            if pid and pid in seen_pid:
                continue
            if pid:
                seen_pid.add(pid)
            loc = (p.get("geometry") or {}).get("location") or {}
            try:
                cand["_dist_m"] = _haversine_m(lat, lng, float(loc["lat"]), float(loc["lng"]))
            except (TypeError, ValueError, KeyError):
                cand["_dist_m"] = None
            merged.append(cand)
        if len(merged) >= 12:
            break

    if not merged:
        for q in _queries_for(ritual_type, None)[:3]:
            text_q = f"{q} near {near_label}"
            places = await places_text_search(cfg, query=text_q, lat=lat, lng=lng)
            for p in places:
                cand = place_to_candidate(p)
                if not cand:
                    continue
                loc = (p.get("geometry") or {}).get("location") or {}
                try:
                    cand["_dist_m"] = _haversine_m(lat, lng, float(loc["lat"]), float(loc["lng"]))
                except (TypeError, ValueError, KeyError):
                    cand["_dist_m"] = None
                merged.append(cand)
            if merged:
                break

    filtered = filter_google_places_tennis_surface(merged, ritual_type, ritual_subtype)
    if filtered:
        merged = filtered
    merged.sort(
        key=lambda x: (
            float(x.get("_dist_m") if x.get("_dist_m") is not None else 1e12),
            x.get("rating") is None,
            -(x.get("rating") or 0.0),
        ),
    )
    out = await _finalize_candidates(
        merged,
        ritual_type=ritual_type,
        ritual_subtype=ritual_subtype,
        ritual_level=ritual_level,
        near_label=near_label,
    )
    return out, near_label, lat, lng


def _filter_tennis_activity_venues(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop generic parks and other non-tennis OSM/Nominatim hits that slipped in with generic queries."""
    out: list[dict[str, Any]] = []
    for c in candidates:
        tags = c.get("_tags") if isinstance(c.get("_tags"), dict) else {}
        sport = str(tags.get("sport") or "").strip().lower()
        court = str(tags.get("court") or "").strip().lower()
        leisure = str(tags.get("leisure") or "").strip().lower()
        name = str(c.get("name") or "")
        addr = str(c.get("address") or "")
        heb = f"{name} {addr}"
        blob = f"{name} {addr}".lower()

        if sport == "tennis" or court == "tennis" or "טניס" in heb or "tennis" in blob:
            out.append(c)
            continue
        if leisure == "pitch" and (sport == "tennis" or "tennis" in blob or "טניס" in heb):
            out.append(c)
            continue
        if leisure == "sports_centre" and ("tennis" in blob or "טניס" in heb):
            out.append(c)
            continue
        if "tennis court" in blob or name.strip().lower() in ("tennis court", "tennis courts"):
            out.append(c)
            continue
        if leisure in ("park", "garden", "nature_reserve", "playground", "common"):
            continue
        if leisure == "sports_centre" and sport and sport != "tennis":
            continue
    return out


async def _suggest_osm_nominatim_only(
    *,
    address: str,
    ritual_type: str,
    ritual_subtype: str | None,
    ritual_level: int | None,
) -> tuple[list[dict[str, Any]], str | None, float | None, float | None]:
    """Fast path when full OSM search times out — Nominatim text search only."""
    geo = await asyncio.wait_for(geocode_address_with_fallback(address=address), timeout=_GEOCODE_TIMEOUT_S)
    if not geo:
        raise ValueError("Could not find that address. Try a fuller street address or city.")

    lat, lng = geo["lat"], geo["lng"]
    near_label = str(geo.get("formatted_address") or address.strip())
    slug = ritual_type.strip().lower()
    city_label = _city_from_near_label(near_label)

    merged = await asyncio.wait_for(
        nominatim_venue_search_fallback(
            lat=lat,
            lon=lng,
            ritual_type_slug=slug,
            ritual_subtype=ritual_subtype,
            city_label=city_label or None,
            near_label=near_label,
            max_queries=4,
        ),
        timeout=_NOMINATIM_ONLY_TIMEOUT_S,
    )
    if len(merged) < 2:
        extra = await nominatim_venue_search_fallback(
            lat=lat,
            lon=lng,
            ritual_type_slug=slug,
            ritual_subtype=ritual_subtype,
            city_label=None,
            max_queries=2,
        )
        if extra:
            merged = _merge_osm_candidates(merged, extra)

    if slug == "tennis" and merged:
        filtered = _filter_tennis_activity_venues(merged)
        if filtered:
            merged = filtered

    merged = _sort_venues_city_first(merged, near_label)
    out = await _finalize_candidates(
        merged,
        ritual_type=ritual_type,
        ritual_subtype=ritual_subtype,
        ritual_level=ritual_level,
        near_label=near_label,
    )
    return out, near_label, lat, lng


async def _suggest_osm(
    *,
    address: str,
    ritual_type: str,
    ritual_subtype: str | None,
    ritual_level: int | None,
) -> tuple[list[dict[str, Any]], str | None]:
    try:
        geo = await asyncio.wait_for(geocode_address_with_fallback(address=address), timeout=_GEOCODE_TIMEOUT_S)
    except TimeoutError as e:
        raise RuntimeError("Geocoding timed out. Try again in a moment.") from e
    if not geo:
        raise ValueError("Could not find that address. Try a fuller street address or city.")

    lat, lng = geo["lat"], geo["lng"]
    near_label = str(geo.get("formatted_address") or address.strip())
    slug = ritual_type.strip().lower()

    try:
        merged = await asyncio.wait_for(
            _gather_osm_near(
                lat=lat,
                lon=lng,
                slug=slug,
                ritual_subtype=ritual_subtype,
                ritual_level=ritual_level,
                near_label=near_label,
            ),
            timeout=_OSM_GATHER_TIMEOUT_S,
        )
    except TimeoutError:
        logger.warning("osm_gather_timeout", extra={"slug": slug, "city": _city_from_near_label(near_label)})
        merged = await asyncio.wait_for(
            nominatim_venue_search_fallback(
                lat=lat,
                lon=lng,
                ritual_type_slug=slug,
                ritual_subtype=ritual_subtype,
                city_label=_city_from_near_label(near_label) or None,
                near_label=near_label,
                max_queries=3,
            ),
            timeout=_NOMINATIM_ONLY_TIMEOUT_S,
        )
        merged = _sort_venues_city_first(merged, near_label)

    out = await _finalize_candidates(
        merged,
        ritual_type=ritual_type,
        ritual_subtype=ritual_subtype,
        ritual_level=ritual_level,
        near_label=near_label,
    )
    return out, near_label, lat, lng


async def suggest_venues_near_address(
    *,
    address: str,
    ritual_type: str,
    ritual_subtype: str | None = None,
    ritual_level: int | None = None,
) -> tuple[list[dict[str, Any]], str | None, float | None, float | None]:
    """
    Returns venues, geocoded label, and optional map center (lat, lon).
    Uses Google Maps when configured; otherwise Nominatim + Overpass (OpenStreetMap).
    """
    cfg = load_google_maps_config()
    if cfg:
        try:
            async with asyncio.timeout(35):
                out, near, lat, lon = await _suggest_google(
                    address=address,
                    ritual_type=ritual_type,
                    ritual_subtype=ritual_subtype,
                    ritual_level=ritual_level,
                    cfg=cfg,
                )
            if out:
                return out, near, lat, lon
        except TimeoutError:
            logger.info("venue_google_timeout_try_osm", extra={"ritual_type": ritual_type.strip()})
        except (ValueError, RuntimeError):
            raise
        except Exception as e:
            logger.warning("venue_google_failed_try_osm", extra={"error": str(e)})
        logger.info("venue_google_empty_try_osm", extra={"ritual_type": ritual_type.strip()})
    else:
        logger.info("venue_suggestions_using_osm_fallback", extra={"ritual_type": ritual_type.strip()})
    try:
        return await asyncio.wait_for(
            _suggest_osm(
                address=address,
                ritual_type=ritual_type,
                ritual_subtype=ritual_subtype,
                ritual_level=ritual_level,
            ),
            timeout=_OSM_TOTAL_TIMEOUT_S,
        )
    except TimeoutError:
        logger.warning("venue_osm_total_timeout_try_nominatim_only", extra={"ritual_type": ritual_type.strip()})
        return await _suggest_osm_nominatim_only(
            address=address,
            ritual_type=ritual_type,
            ritual_subtype=ritual_subtype,
            ritual_level=ritual_level,
        )

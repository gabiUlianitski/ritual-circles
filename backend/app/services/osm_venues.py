"""
OpenStreetMap fallback: Nominatim (geocode) + Overpass (nearby features).
Public endpoints have strict fair-use limits; respect them (light use, cache later if needed).
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import time
import unicodedata
from difflib import SequenceMatcher
from typing import Any

import httpx

from app.services.maps_config import load_osm_endpoints, load_httpx_verify_ssl, load_overpass_interpreter_urls
from app.services.venue_hoby_blurb import osm_hoby_relation

logger = logging.getLogger(__name__)

# Nominatim requires a descriptive User-Agent (https://operations.osmfoundation.org/policies/nominatim/).
_DEFAULT_UA = "RitualCirclesBackend/1.0 (venue suggestions; contact: https://example.invalid)"
_PHOTON_BASE = "https://photon.komoot.io/api/"
_CITY_SUGGEST_TTL_S = 600.0
_CITY_SUGGEST_CACHE_VER = 4
_CITY_SUGGEST_CACHE: dict[tuple[str, str | None, int], tuple[float, list[dict[str, Any]]]] = {}
_NOMINATIM_REJECT_CLASSES = frozenset(
    {
        "amenity",
        "tourism",
        "shop",
        "building",
        "highway",
        "railway",
        "natural",
        "leisure",
        "office",
        "historic",
        "man_made",
    }
)
# Common transliterations when Nominatim has no fuzzy match (Israel bias).
_IL_CITY_QUERY_ALIASES: dict[str, str] = {
    "nazeret": "Nazareth",
    "nazaret": "Nazareth",
    "nazreth": "Nazareth",
    "nazrat": "Nazareth",
    "tel aviv": "Tel Aviv-Yafo",
    "tel-aviv": "Tel Aviv-Yafo",
    "jerusalem": "Jerusalem",
    "yerushalayim": "Jerusalem",
    "haifa": "Haifa",
    "beer sheva": "Beersheba",
    "beersheba": "Beersheba",
    "rishon": "Rishon LeZion",
    "rishon lezion": "Rishon LeZion",
    "rishon le zion": "Rishon LeZion",
    "petah tikva": "Petah Tikva",
    "petah tikvah": "Petah Tikva",
}
# Partial typing toward well-known cities (worldwide).
_GLOBAL_CITY_QUERY_COMPLETIONS: dict[str, str] = {
    "mad": "Madrid",
    "madri": "Madrid",
    "madr": "Madrid",
    "barcelon": "Barcelona",
    "barcel": "Barcelona",
    "pari": "Paris",
    "lond": "London",
    "berl": "Berlin",
    "rom": "Rome",
    "amster": "Amsterdam",
    "nazeret": "Nazareth",
    "nazaret": "Nazareth",
}
_PLACE_TIER_CITY = 4
_PLACE_TIER_TOWN = 3
_PLACE_TIER_SUBURB = 2
_PLACE_TIER_VILLAGE = 1
_NOMINATIM_MIN_INTERVAL_S = 1.05
_nominatim_lock = asyncio.Lock()
_nominatim_last_at = 0.0
_PLACE_TYPES = frozenset(
    {"city", "town", "village", "hamlet", "municipality", "locality", "suburb", "administrative"}
)
_COUNTRY_BBOX: dict[str, str] = {
    # minLon,minLat,maxLon,maxLat — Photon bbox bias
    "IL": "34.17,29.45,35.92,33.28",
}


def _user_agent() -> str:
    return (os.getenv("NOMINATIM_USER_AGENT") or _DEFAULT_UA).strip() or _DEFAULT_UA


def _city_suggest_cache_get(key: tuple[str, str | None]) -> list[dict[str, Any]] | None:
    row = _CITY_SUGGEST_CACHE.get((key[0], key[1], _CITY_SUGGEST_CACHE_VER))
    if not row:
        return None
    expires_at, items = row
    if time.monotonic() > expires_at:
        _CITY_SUGGEST_CACHE.pop((key[0], key[1], _CITY_SUGGEST_CACHE_VER), None)
        return None
    return list(items)


def _city_suggest_cache_set(key: tuple[str, str | None], items: list[dict[str, Any]]) -> None:
    _CITY_SUGGEST_CACHE[(key[0], key[1], _CITY_SUGGEST_CACHE_VER)] = (
        time.monotonic() + _CITY_SUGGEST_TTL_S,
        list(items),
    )


def _normalize_city_match(text: str) -> str:
    s = unicodedata.normalize("NFKD", text.strip().casefold())
    return "".join(ch for ch in s if not unicodedata.combining(ch) and (ch.isalnum() or ch.isspace())).strip()


def _name_matches_city_query(name: str, query: str) -> bool:
    n = _normalize_city_match(name)
    q = _normalize_city_match(query)
    if not n or not q or len(q) < 2:
        return False
    if q in n or n in q:
        return True
    if len(q) >= 3 and (n.startswith(q) or q.startswith(n)):
        return True
    return SequenceMatcher(None, n, q).ratio() >= 0.72


def _nominatim_row_is_settlement(row: dict[str, Any]) -> bool:
    cls = str(row.get("class") or "").lower()
    typ = str(row.get("type") or "").lower()
    if cls in _NOMINATIM_REJECT_CLASSES:
        return False
    if cls == "place" and typ in _PLACE_TYPES:
        return True
    if cls == "boundary" and typ == "administrative":
        try:
            rank = int(row.get("place_rank") or 0)
        except (TypeError, ValueError):
            rank = 0
        return rank >= 8
    return False


def _locality_names_from_nominatim_row(row: dict[str, Any]) -> list[str]:
    names: list[str] = []
    place_name = str(row.get("name") or "").strip()
    if place_name:
        names.append(place_name)
    addr = row.get("address")
    if isinstance(addr, dict):
        for k in ("city", "town", "village", "municipality", "hamlet", "suburb", "locality"):
            v = addr.get(k)
            if v and str(v).strip():
                names.append(str(v).strip())
    display = str(row.get("display_name") or "").strip()
    if display:
        names.append(display.split(",")[0].strip())
    out: list[str] = []
    seen: set[str] = set()
    for n in names:
        key = n.casefold()
        if key and key not in seen:
            seen.add(key)
            out.append(n)
    return out


def _nominatim_row_matches_query(row: dict[str, Any], query: str) -> bool:
    if not _nominatim_row_is_settlement(row):
        return False
    return any(_name_matches_city_query(n, query) for n in _locality_names_from_nominatim_row(row))


def _suggest_row_matches_query(row: dict[str, Any], query: str) -> bool:
    short = str(row.get("shortName") or "").strip()
    if short and _name_matches_city_query(short, query):
        return True
    display = str(row.get("displayName") or "").strip()
    if display and _name_matches_city_query(display.split(",")[0], query):
        return True
    return _name_matches_city_query(display, query)


def _score_city_suggest_row(row: dict[str, Any], query: str) -> float:
    short = str(row.get("shortName") or "")
    qn = _normalize_city_match(query)
    sn = _normalize_city_match(short)
    if not sn:
        return 0.0
    score = SequenceMatcher(None, sn, qn).ratio()
    if sn.startswith(qn) or qn.startswith(sn):
        score += 0.35
    if qn in sn:
        score += 0.2
    if len(qn) >= 3 and len(sn) > len(qn) and sn.startswith(qn):
        score += 0.45
    tier = int(row.get("_placeTier") or 0)
    score += tier * 0.1
    return score


def _merge_city_suggest_batches(*batches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for batch in batches:
        for row in batch:
            dn = str(row.get("displayName") or "")
            if not dn or dn in seen:
                continue
            seen.add(dn)
            out.append(row)
    return out


def _filter_rank_city_suggestions(
    rows: list[dict[str, Any]],
    *,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    q = query.strip()
    if not q:
        return rows[:limit]
    filtered = [r for r in rows if _suggest_row_matches_query(r, q)]
    filtered.sort(key=lambda r: _score_city_suggest_row(r, q), reverse=True)
    out: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    seen_short: set[str] = set()
    for row in filtered:
        dn = str(row.get("displayName") or "")
        if not dn or dn in seen_names:
            continue
        sk = _normalize_city_match(str(row.get("shortName") or ""))
        if sk and sk in seen_short:
            continue
        seen_names.add(dn)
        if sk:
            seen_short.add(sk)
        clean = {k: v for k, v in row.items() if not str(k).startswith("_")}
        out.append(clean)
        if len(out) >= limit:
            break
    return out


async def _nominatim_throttle() -> None:
    global _nominatim_last_at
    async with _nominatim_lock:
        wait = _NOMINATIM_MIN_INTERVAL_S - (time.monotonic() - _nominatim_last_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _nominatim_last_at = time.monotonic()


def _country_name_for_code(country_code: str | None) -> str | None:
    cc = (country_code or "").strip().upper()
    if len(cc) != 2:
        return None
    try:
        import pycountry

        row = pycountry.countries.get(alpha_2=cc)
        return str(row.name) if row else None
    except Exception:
        return None


def _photon_row_matches_country(props: dict[str, Any], country_code: str | None) -> bool:
    if not country_code:
        return True
    expected = _country_name_for_code(country_code)
    if not expected:
        return True
    country = str(props.get("country") or "").strip()
    if not country:
        return True
    return country.lower() == expected.lower()


def _photon_display_name(props: dict[str, Any]) -> str:
    name = str(props.get("name") or "").strip()
    parts: list[str] = [name] if name else []
    city = str(props.get("city") or "").strip()
    if city and city.lower() != name.lower():
        parts.append(city)
    for key in ("state", "country"):
        value = str(props.get(key) or "").strip()
        if value and value not in parts:
            parts.append(value)
    return ", ".join(parts) if parts else name


def _photon_is_place(props: dict[str, Any]) -> bool:
    osm_key = str(props.get("osm_key") or "").lower()
    osm_value = str(props.get("osm_value") or "").lower()
    typ = str(props.get("type") or "").lower()
    if osm_key == "place":
        return osm_value in _PLACE_TYPES or typ in _PLACE_TYPES
    return osm_value in _PLACE_TYPES or typ in _PLACE_TYPES


def _parse_photon_city_rows(
    features: Any,
    *,
    limit: int,
    country_code: str | None,
    query: str,
) -> list[dict[str, Any]]:
    if not isinstance(features, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    lim = min(15, max(1, limit))
    for feature in features:
        if not isinstance(feature, dict):
            continue
        props = feature.get("properties")
        if not isinstance(props, dict) or not _photon_is_place(props):
            continue
        if not _photon_row_matches_country(props, country_code):
            continue
        display_name = _photon_display_name(props)
        if not display_name or display_name in seen:
            continue
        geom = feature.get("geometry")
        coords = geom.get("coordinates") if isinstance(geom, dict) else None
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        try:
            lon = float(coords[0])
            lat = float(coords[1])
        except (TypeError, ValueError):
            continue
        short = str(props.get("name") or display_name.split(",")[0]).strip() or display_name
        item = _city_suggest_item(
            short=short,
            display_name=display_name,
            lat=lat,
            lon=lon,
            country_code=_country_code_from_photon_props(props),
            place_tier=_place_tier_from_photon_props(props),
        )
        if query.strip() and not _suggest_row_matches_query(item, query):
            continue
        seen.add(display_name)
        out.append(item)
        if len(out) >= lim:
            break
    return out


async def _photon_city_search_once(
    *,
    query: str,
    country_code: str | None,
    limit: int,
    client: httpx.AsyncClient,
) -> list[dict[str, Any]]:
    q = query.strip()
    if len(q) < 1:
        return []
    params: dict[str, str] = {
        "q": q,
        "limit": str(min(15, max(1, limit))),
        "lang": "en",
    }
    cc = (country_code or "").strip().upper()
    bbox = _COUNTRY_BBOX.get(cc)
    if bbox:
        params["bbox"] = bbox
    try:
        r = await client.get(_PHOTON_BASE, params=params)
    except httpx.RequestError as e:
        logger.warning("photon_city_suggest_request_error", extra={"error": str(e), "q": q[:40]})
        return []
    if r.status_code >= 400:
        logger.warning(
            "photon_city_suggest_http",
            extra={"status": r.status_code, "q": q[:40], "body": (r.text or "")[:200]},
        )
        return []
    try:
        data = r.json()
    except json.JSONDecodeError:
        return []
    features = data.get("features") if isinstance(data, dict) else None
    return _parse_photon_city_rows(features, limit=limit, country_code=country_code, query=query)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _addr_from_tags(tags: dict[str, str]) -> str:
    parts: list[str] = []
    if tags.get("addr:housenumber") or tags.get("addr:street"):
        line = " ".join(
            x
            for x in (tags.get("addr:housenumber", "").strip(), tags.get("addr:street", "").strip())
            if x
        )
        if line:
            parts.append(line)
    city = tags.get("addr:city") or tags.get("addr:place") or tags.get("addr:village") or ""
    if city.strip():
        parts.append(city.strip())
    pc = tags.get("addr:postcode", "").strip()
    if pc:
        parts.append(pc)
    return ", ".join(parts)


def _display_name_from_osm(tags: dict[str, str], ritual_slug: str) -> str:
    for k in ("name", "official_name"):
        v = tags.get(k)
        if v and str(v).strip():
            return str(v).strip()

    slug = (ritual_slug or "").strip().lower()
    sport = (tags.get("sport") or "").strip().lower()
    leisure = (tags.get("leisure") or "").strip().lower()
    amenity = (tags.get("amenity") or "").strip().lower()
    highway = (tags.get("highway") or "").strip().lower()
    surface = (tags.get("surface") or "").strip().lower()
    covered = (tags.get("covered") or "").lower() == "yes"

    if slug == "tennis" and (sport == "tennis" or leisure == "pitch"):
        parts: list[str] = ["Tennis court"]
        if surface in ("asphalt", "concrete", "artificial_turf"):
            parts.append("(hard surface)")
        elif surface == "clay":
            parts.append("(clay)")
        elif surface == "grass":
            parts.append("(grass)")
        elif surface:
            parts.append(f"({surface.replace('_', ' ')})")
        if covered:
            parts.append("covered")
        if tags.get("operator") and str(tags["operator"]).strip():
            return f'{str(tags["operator"]).strip()} — {" ".join(parts)}'
        if tags.get("ref") and str(tags["ref"]).strip():
            parts.append(f"#{str(tags["ref"]).strip()}")
        return " ".join(parts)

    if slug == "bicycle":
        if highway == "cycleway":
            return "Cycleway (mapped)"
        if tags.get("cycleway"):
            return "Street with cycleway (mapped)"
        if leisure == "park" and tags.get("name"):
            return str(tags["name"]).strip()
        if leisure == "park":
            return "Park (meeting point)"
        if amenity == "bicycle_rental":
            return "Bicycle rental"

    if amenity == "community_centre":
        return "Community centre"
    if amenity == "library":
        return "Library"
    if amenity == "cafe":
        return "Café"
    if leisure == "sports_centre":
        return "Sports centre"
    if leisure == "dance":
        return "Dance venue"
    if amenity == "arts_centre":
        return "Arts centre"
    if leisure == "park":
        return str(tags["name"]).strip() if tags.get("name") else "Park"

    for k in ("operator", "brand", "ref"):
        v = tags.get(k)
        if v and str(v).strip():
            return str(v).strip()

    bits = [b for b in (leisure, amenity, highway, sport) if b]
    if bits:
        return ", ".join(b.replace("_", " ") for b in bits[:3])
    return "Mapped place"


def _element_lat_lon(el: dict[str, Any]) -> tuple[float, float] | None:
    if el.get("lat") is not None and el.get("lon") is not None:
        try:
            return float(el["lat"]), float(el["lon"])
        except (TypeError, ValueError):
            pass
    c = el.get("center")
    if isinstance(c, dict) and c.get("lat") is not None and c.get("lon") is not None:
        try:
            return float(c["lat"]), float(c["lon"])
        except (TypeError, ValueError):
            pass
    return None


def _osm_maps_url(el_type: str, osm_id: int, lat: float, lon: float) -> str:
    if el_type in ("node", "way", "relation") and osm_id > 0:
        return f"https://www.openstreetmap.org/{el_type}/{osm_id}"
    return f"https://www.openstreetmap.org/#map=17/{lat}/{lon}"


def _norm_subtype(sub: str | None) -> str:
    return (sub or "").strip().lower().replace(" ", "_").replace("-", "_")


_TENNIS_HARD_SURFACES = frozenset(
    {
        "asphalt",
        "concrete",
        "artificial_turf",
        "acrylic",
        "decoturf",
        "paved",
        "hard",
        "tartan",
        "artificial",
        "paving_stones",
        "sett",
        "compacted",
        "metal",
        "plastic",
        "rubber",
    }
)
_TENNIS_CLAY_SURFACES = frozenset({"clay", "dirt", "earth", "fine_gravel", "sand"})
_TENNIS_GRASS_SURFACES = frozenset({"grass"})


def tennis_surface_request_bucket(subtype: str | None) -> str | None:
    """Which court surface family the user asked for, or None if not surface-specific."""
    su = _norm_subtype(subtype)
    if not su:
        return None
    if any(k in su for k in ("clay", "red_clay", "clay_court")):
        return "clay"
    if any(k in su for k in ("grass", "lawn", "grass_court")):
        return "grass"
    if any(k in su for k in ("hard", "hard_court", "synthetic", "acrylic_court")):
        return "hard"
    if any(k in su for k in ("indoor", "hall", "indoor_court")):
        return "indoor"
    return None


def _tennis_surface_class_from_tags(tags: dict[str, str]) -> str:
    s = (tags.get("surface") or "").strip().lower()
    if s in _TENNIS_CLAY_SURFACES:
        return "clay"
    if s in _TENNIS_GRASS_SURFACES:
        return "grass"
    if s in _TENNIS_HARD_SURFACES:
        return "hard"
    if s:
        return "other"
    return "unknown"


def filter_tennis_rows_for_surface_subtype(
    merged: list[dict[str, Any]],
    ritual_subtype: str | None,
) -> list[dict[str, Any]]:
    """Prefer OSM rows that match the user's court-type; if none qualify, keep all rows (surface is often untagged)."""
    want = tennis_surface_request_bucket(ritual_subtype)
    if want is None:
        return merged

    scored: list[tuple[dict[str, Any], str]] = []
    for m in merged:
        tags = m.get("_tags") if isinstance(m.get("_tags"), dict) else {}
        cls = _tennis_surface_class_from_tags(tags)
        if want == "indoor":
            cov = (tags.get("covered") or "").lower() == "yes"
            ind = (tags.get("indoor") or "").lower() == "yes"
            leis = (tags.get("leisure") or "").lower()
            sp = (tags.get("sport") or "").lower()
            if ind or cov or (leis == "sports_centre" and sp == "tennis"):
                scored.append((m, "indoorish"))
            continue
        if want == "clay":
            if cls in ("hard", "grass", "other"):
                continue
            scored.append((m, cls))
        elif want == "grass":
            if cls in ("hard", "clay", "other"):
                continue
            scored.append((m, cls))
        elif want == "hard":
            if cls in ("clay", "grass"):
                continue
            scored.append((m, cls))

    if want == "clay":
        clay_rows = [m for m, cls in scored if cls == "clay"]
        if not clay_rows:
            # OSM often omits surface=*; do not hide all nearby courts.
            return merged
        clay_rows.sort(key=lambda x: float(x.get("_dist_m") or 0))
        for m in clay_rows:
            m["_tennis_surface_match"] = "matched"
        return clay_rows

    if want == "grass":
        g = [m for m, cls in scored if cls == "grass"]
        if not g:
            return merged
        g.sort(key=lambda x: float(x.get("_dist_m") or 0))
        for m in g:
            m["_tennis_surface_match"] = "matched"
        return g

    if want == "hard":
        h = [m for m, cls in scored if cls == "hard"]
        if not h:
            return merged
        h.sort(key=lambda x: float(x.get("_dist_m") or 0))
        for m in h:
            m["_tennis_surface_match"] = "matched"
        return h

    if want == "indoor":
        out = [m for m, _ in scored]
        if not out:
            return merged
        out.sort(key=lambda x: float(x.get("_dist_m") or 0))
        for m in out:
            m["_tennis_surface_match"] = "matched"
        return out


def _tennis_union_shared(r: int, lat: float, lon: float) -> list[str]:
    """Indexed-friendly OSM selectors (avoid regex on large `around:` — often times out public Overpass)."""
    return [
        f'  nwr["sport"="tennis"](around:{r},{lat},{lon});',
        f'  nwr["leisure"="pitch"]["sport"="tennis"](around:{r},{lat},{lon});',
        f'  nwr["leisure"="sports_centre"]["sport"="tennis"](around:{r},{lat},{lon});',
        f'  nwr["court"="tennis"](around:{r},{lat},{lon});',
    ]


def _overpass_union_lines(slug: str, lat: float, lon: float, radius_m: int, subtype: str | None) -> str:
    r = radius_m
    s = slug.lower()
    su = _norm_subtype(subtype)
    # nwr = nodes + ways + relations (Overpass QL)
    if s == "tennis":
        want = tennis_surface_request_bucket(subtype)
        if want == "clay":
            clay_first = [
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="clay"](around:{r},{lat},{lon});',
                f'  nwr["sport"="tennis"]["surface"="clay"](around:{r},{lat},{lon});',
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="dirt"](around:{r},{lat},{lon});',
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="earth"](around:{r},{lat},{lon});',
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="fine_gravel"](around:{r},{lat},{lon});',
            ]
            return "\n".join(clay_first + _tennis_union_shared(r, lat, lon))
        if want == "grass":
            grass_first = [
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="grass"](around:{r},{lat},{lon});',
                f'  nwr["sport"="tennis"]["surface"="grass"](around:{r},{lat},{lon});',
            ]
            return "\n".join(grass_first + _tennis_union_shared(r, lat, lon))
        if want == "hard":
            hard_first = [
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="asphalt"](around:{r},{lat},{lon});',
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="concrete"](around:{r},{lat},{lon});',
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="artificial_turf"](around:{r},{lat},{lon});',
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["surface"="acrylic"](around:{r},{lat},{lon});',
                f'  nwr["sport"="tennis"]["surface"="asphalt"](around:{r},{lat},{lon});',
            ]
            return "\n".join(hard_first + _tennis_union_shared(r, lat, lon))
        if want == "indoor":
            indoor_first = [
                f'  nwr["sport"="tennis"]["indoor"="yes"](around:{r},{lat},{lon});',
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["indoor"="yes"](around:{r},{lat},{lon});',
                f'  nwr["leisure"="pitch"]["sport"="tennis"]["covered"="yes"](around:{r},{lat},{lon});',
            ]
            return "\n".join(indoor_first + _tennis_union_shared(r, lat, lon))
        lines = list(_tennis_union_shared(r, lat, lon))
        if any(k in su for k in ("indoor", "hall")):
            lines.append(f'  nwr["leisure"="sports_centre"]["sport"="tennis"](around:{r},{lat},{lon});')
        return "\n".join(lines)
    if s == "bicycle":
        r2 = min(r, 14_000)
        r_path = min(r2, 10_000)
        lines = [
            f'  nwr["highway"="cycleway"](around:{r2},{lat},{lon});',
            f'  way["cycleway"](around:{r2},{lat},{lon});',
            f'  way["bicycle"="designated"](around:{r2},{lat},{lon});',
            f'  nwr["amenity"="bicycle_rental"](around:{r},{lat},{lon});',
            f'  nwr["leisure"="park"]["name"](around:{r},{lat},{lon});',
            f'  way["highway"="path"]["surface"="asphalt"](around:{r_path},{lat},{lon});',
            f'  way["highway"="path"]["surface"="paved"](around:{r_path},{lat},{lon});',
        ]
        is_mtb = any(k in su for k in ("mountain", "mtb", "trail", "downhill", "enduro", "gravel"))
        if is_mtb:
            lines += [
                f'  nwr["mtb"="yes"](around:{min(r2, 4000)},{lat},{lon});',
                f'  nwr["leisure"="track"]["sport"="cycling"](around:{r2},{lat},{lon});',
            ]
        else:
            lines += [
                f'  way["cycleway"="lane"](around:{r2},{lat},{lon});',
                f'  way["cycleway"="track"](around:{r2},{lat},{lon});',
            ]
        return "\n".join(lines)
    if s == "chess":
        return "\n".join(
            [
                f'  nwr["amenity"="cafe"](around:{r},{lat},{lon});',
                f'  nwr["amenity"="library"](around:{r},{lat},{lon});',
                f'  nwr["amenity"="community_centre"](around:{r},{lat},{lon});',
            ]
        )
    if s == "coffee":
        return f'  nwr["amenity"="cafe"](around:{r},{lat},{lon});'
    if s == "cooking":
        return "\n".join(
            [
                f'  nwr["amenity"="community_centre"](around:{r},{lat},{lon});',
                f'  nwr["amenity"="social_facility"](around:{r},{lat},{lon});',
            ]
        )
    if s == "dancing":
        return "\n".join(
            [
                f'  nwr["leisure"="dance"](around:{r},{lat},{lon});',
                f'  nwr["amenity"="arts_centre"](around:{r},{lat},{lon});',
            ]
        )
    return "\n".join(
        [
            f'  nwr["leisure"="park"]["name"](around:{r},{lat},{lon});',
            f'  nwr["leisure"="park"](around:{r},{lat},{lon});',
            f'  nwr["amenity"="community_centre"](around:{r},{lat},{lon});',
            f'  nwr["leisure"="sports_centre"](around:{r},{lat},{lon});',
        ]
    )


async def nominatim_geocode(*, address: str, nominatim_base: str | None = None) -> dict[str, Any] | None:
    geo, status = await _nominatim_geocode_once(address=address, nominatim_base=nominatim_base)
    if status == 429:
        raise RuntimeError(
            "Geocoding rate-limited (HTTP 429). Try again in a minute or use your own Nominatim instance."
        )
    return geo


_GEOCODE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _geocode_cache_get(key: str) -> dict[str, Any] | None:
    row = _GEOCODE_CACHE.get(key)
    if not row:
        return None
    expires_at, geo = row
    if time.monotonic() > expires_at:
        _GEOCODE_CACHE.pop(key, None)
        return None
    return dict(geo)


def _geocode_cache_set(key: str, geo: dict[str, Any]) -> None:
    _GEOCODE_CACHE[key] = (time.monotonic() + _CITY_SUGGEST_TTL_S, dict(geo))


async def _nominatim_geocode_once(
    *,
    address: str,
    nominatim_base: str | None = None,
) -> tuple[dict[str, Any] | None, int | None]:
    base = (nominatim_base or load_osm_endpoints()[0]).rstrip("/")
    url = f"{base}/search"
    params = {"q": address.strip(), "format": "json", "limit": "1", "addressdetails": "1"}
    headers = {"User-Agent": _user_agent(), "Accept": "application/json", "Accept-Language": "en,he"}
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            r = await client.get(url, params=params)
    except httpx.RequestError as e:
        logger.warning("nominatim_request_error", exc_info=True)
        raise RuntimeError(
            "Could not reach the geocoding service (network or TLS). "
            "If you are on a corporate network, set HTTPX_VERIFY to false in config/google_maps_keys.json."
        ) from e
    if r.status_code == 403:
        raise RuntimeError(
            "Geocoding returned HTTP 403. Set env NOMINATIM_USER_AGENT to a string that identifies your app "
            "(see OpenStreetMap Nominatim usage policy)."
        )
    if r.status_code == 429:
        return None, 429
    if r.status_code >= 400:
        logger.warning("nominatim_http", extra={"status": r.status_code, "body": (r.text or "")[:300]})
        return None, r.status_code
    try:
        rows = r.json()
    except json.JSONDecodeError:
        logger.warning("nominatim_bad_json", extra={"snippet": (r.text or "")[:300]})
        raise RuntimeError("Geocoding service returned a non-JSON response (wrong URL or blocked response).") from None
    if not isinstance(rows, list) or not rows:
        return None, r.status_code
    row = rows[0]
    try:
        lat, lon = float(row["lat"]), float(row["lon"])
    except (KeyError, TypeError, ValueError):
        return None, r.status_code
    label = str(row.get("display_name") or address.strip())
    return {"lat": lat, "lng": lon, "formatted_address": label}, r.status_code


async def photon_geocode(*, address: str) -> dict[str, Any] | None:
    q = address.strip()
    if not q:
        return None
    headers = {"User-Agent": _user_agent(), "Accept": "application/json"}
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(18.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            r = await client.get(_PHOTON_BASE, params={"q": q, "limit": "1", "lang": "en"})
    except httpx.RequestError as e:
        logger.warning("photon_geocode_request_error", extra={"error": str(e), "q": q[:60]})
        return None
    if r.status_code >= 400:
        logger.warning(
            "photon_geocode_http",
            extra={"status": r.status_code, "q": q[:60], "body": (r.text or "")[:200]},
        )
        return None
    try:
        data = r.json()
    except json.JSONDecodeError:
        return None
    features = data.get("features") if isinstance(data, dict) else None
    rows = _parse_photon_city_rows(features, limit=1, country_code=None, query="")
    if not rows:
        return None
    row = rows[0]
    try:
        lat = float(row["lat"])
        lon = float(row["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    label = str(row.get("displayName") or q)
    return {"lat": lat, "lng": lon, "formatted_address": label}


async def geocode_address_with_fallback(*, address: str) -> dict[str, Any] | None:
    """Geocode for venue search — Nominatim first (throttled), Photon when rate-limited or empty."""
    q = address.strip()
    if not q:
        return None
    cache_key = q.lower()
    cached = _geocode_cache_get(cache_key)
    if cached is not None:
        return cached

    await _nominatim_throttle()
    geo, status = await _nominatim_geocode_once(address=q)
    if geo:
        _geocode_cache_set(cache_key, geo)
        return geo

    if status == 429:
        logger.info("nominatim_geocode_rate_limited_using_photon", extra={"q": q[:60]})

    geo = await photon_geocode(address=q)
    if geo:
        _geocode_cache_set(cache_key, geo)
        return geo
    return None


def _norm_country_code_iso2(raw: Any) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().upper()
    if len(s) == 2 and s.isalpha():
        return s
    return None


def _country_code_from_nominatim_row(row: dict[str, Any]) -> str | None:
    addr = row.get("address")
    if isinstance(addr, dict):
        return _norm_country_code_iso2(addr.get("country_code"))
    return None


def _country_code_from_photon_props(props: dict[str, Any]) -> str | None:
    return _norm_country_code_iso2(props.get("countrycode"))


def _place_tier_from_nominatim_row(row: dict[str, Any]) -> int:
    typ = str(row.get("type") or "").lower()
    if typ == "city":
        return _PLACE_TIER_CITY
    if typ in ("town", "municipality"):
        return _PLACE_TIER_TOWN
    if typ in ("suburb", "locality"):
        return _PLACE_TIER_SUBURB
    if typ in ("village", "hamlet"):
        return _PLACE_TIER_VILLAGE
    addr = row.get("address")
    if isinstance(addr, dict):
        if addr.get("city"):
            return _PLACE_TIER_CITY
        if addr.get("town") or addr.get("municipality"):
            return _PLACE_TIER_TOWN
        if addr.get("village") or addr.get("hamlet"):
            return _PLACE_TIER_VILLAGE
    return _PLACE_TIER_SUBURB


def _place_tier_from_photon_props(props: dict[str, Any]) -> int:
    val = str(props.get("osm_value") or props.get("type") or "").lower()
    if val == "city":
        return _PLACE_TIER_CITY
    if val in ("town", "municipality"):
        return _PLACE_TIER_TOWN
    if val in ("suburb", "locality"):
        return _PLACE_TIER_SUBURB
    if val in ("village", "hamlet"):
        return _PLACE_TIER_VILLAGE
    return _PLACE_TIER_SUBURB


def _city_suggest_item(
    *,
    short: str,
    display_name: str,
    lat: float | None,
    lon: float | None,
    country_code: str | None,
    place_tier: int = 0,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "shortName": short,
        "displayName": display_name,
        "lat": lat,
        "lon": lon,
        "_placeTier": place_tier,
    }
    if country_code:
        item["countryCode"] = country_code
    return item


def _city_short_label(row: dict[str, Any], display_name: str) -> str:
    cls = str(row.get("class") or "").lower()
    if cls == "place":
        place_name = str(row.get("name") or "").strip()
        if place_name:
            return place_name
    addr = row.get("address")
    if isinstance(addr, dict):
        for k in ("city", "town", "village", "municipality", "hamlet", "suburb", "locality"):
            v = addr.get(k)
            if v and str(v).strip():
                return str(v).strip()
    return display_name.split(",")[0].strip() or display_name.strip()


def _parse_nominatim_city_rows(rows: Any, *, limit: int, query: str) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    lim = min(15, max(1, limit))
    q = query.strip()
    for row in rows:
        if not isinstance(row, dict):
            continue
        if q and not _nominatim_row_matches_query(row, q):
            continue
        display_name = str(row.get("display_name") or "").strip()
        if not display_name or display_name in seen:
            continue
        seen.add(display_name)
        short = _city_short_label(row, display_name)
        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
        except (KeyError, TypeError, ValueError):
            lat, lon = None, None
        out.append(
            _city_suggest_item(
                short=short,
                display_name=display_name,
                lat=lat,
                lon=lon,
                country_code=_country_code_from_nominatim_row(row),
                place_tier=_place_tier_from_nominatim_row(row),
            )
        )
        if len(out) >= lim:
            break
    return out


async def _nominatim_city_search_once(
    *,
    query: str,
    country_code: str | None,
    base: str,
    limit: int,
    client: httpx.AsyncClient,
) -> tuple[list[dict[str, Any]], int | None]:
    q = query.strip()
    if len(q) < 1:
        return [], None
    lim = min(15, max(1, limit))
    params: dict[str, str] = {
        "q": q,
        "format": "json",
        "limit": str(lim),
        "addressdetails": "1",
        "dedupe": "1",
        "featuretype": "settlement",
    }
    cc = (country_code or "").strip().upper()
    if len(cc) == 2 and cc.isalpha():
        params["countrycodes"] = cc.lower()
    try:
        r = await client.get(f"{base.rstrip('/')}/search", params=params)
    except httpx.RequestError as e:
        logger.warning("nominatim_city_suggest_request_error", extra={"error": str(e), "q": q[:40]})
        return [], None
    if r.status_code >= 400:
        logger.warning(
            "nominatim_city_suggest_http",
            extra={"status": r.status_code, "q": q[:40], "body": (r.text or "")[:200]},
        )
        return [], r.status_code
    try:
        rows = r.json()
    except json.JSONDecodeError:
        return [], r.status_code
    return _parse_nominatim_city_rows(rows, limit=lim, query=q), r.status_code


def _city_suggest_query_variants(query: str, country_code: str | None) -> list[tuple[str, str | None]]:
    q = query.strip()
    if not q:
        return []
    cc = (country_code or "").strip().upper() or None
    country_name = _country_name_for_code(cc) if cc else None
    variants: list[tuple[str, str | None]] = []
    q_key = _normalize_city_match(q)
    completion = _GLOBAL_CITY_QUERY_COMPLETIONS.get(q_key)
    if completion:
        variants.append((completion, cc))
        variants.append((completion, None))
    if cc == "IL":
        alias = _IL_CITY_QUERY_ALIASES.get(q_key)
        if alias:
            variants.append((alias, cc))
            if country_name:
                variants.append((f"{alias}, {country_name}", cc))
    if country_name and country_name.lower() not in q.lower():
        variants.append((f"{q}, {country_name}", cc))
    variants.append((q, cc))
    if not cc:
        variants.append((q, None))
    seen: set[tuple[str, str | None]] = set()
    out: list[tuple[str, str | None]] = []
    for item in variants:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


async def _photon_city_suggest(
    *,
    query: str,
    country_code: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    q = query.strip()
    if len(q) < 1:
        return []
    headers = {"User-Agent": _user_agent(), "Accept": "application/json"}
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(18.0)
    lim = min(15, max(1, limit))
    merged: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    cc = (country_code or "").strip().upper() or None
    country_name = _country_name_for_code(cc) if cc else None
    queries = [q]
    q_key = _normalize_city_match(q)
    if cc == "IL":
        alias = _IL_CITY_QUERY_ALIASES.get(q_key)
        if alias:
            queries.insert(0, alias)
    if country_name and country_name.lower() not in q.lower():
        queries.append(f"{q} {country_name}")
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            for q_try in queries:
                batch = await _photon_city_search_once(
                    query=q_try,
                    country_code=country_code,
                    limit=lim,
                    client=client,
                )
                for row in batch:
                    dn = str(row.get("displayName") or "")
                    if not dn or dn in seen_names:
                        continue
                    seen_names.add(dn)
                    merged.append(row)
                    if len(merged) >= lim:
                        return _filter_rank_city_suggestions(merged, query=q, limit=lim)
    except httpx.RequestError as e:
        logger.warning("photon_city_suggest_client_error", extra={"error": str(e)})
    return _filter_rank_city_suggestions(merged, query=q, limit=lim)


async def nominatim_city_suggest(
    *,
    query: str,
    country_code: str | None = None,
    nominatim_base: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Forward geocode search for city / settlement autocomplete (Nominatim + Photon fallback)."""
    q = query.strip()
    if len(q) < 1:
        return []
    cc = (country_code or "").strip().upper() or None
    cache_key = (q.lower(), cc)
    cached = _city_suggest_cache_get(cache_key)
    if cached is not None:
        return cached[: min(15, max(1, limit))]

    base = (nominatim_base or load_osm_endpoints()[0]).rstrip("/")
    lim = min(15, max(1, limit))
    headers = {
        "User-Agent": _user_agent(),
        "Accept": "application/json",
        "Accept-Language": "en,he",
    }
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(22.0)
    merged: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    rate_limited = False
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            for q_try, cc_try in _city_suggest_query_variants(q, cc):
                await _nominatim_throttle()
                batch, status = await _nominatim_city_search_once(
                    query=q_try,
                    country_code=cc_try,
                    base=base,
                    limit=lim,
                    client=client,
                )
                if status == 429:
                    rate_limited = True
                    break
                for row in batch:
                    dn = str(row.get("displayName") or "")
                    if not dn or dn in seen_names:
                        continue
                    seen_names.add(dn)
                    merged.append(row)
    except httpx.RequestError as e:
        logger.warning("nominatim_city_suggest_client_error", extra={"error": str(e)})

    photon_rows: list[dict[str, Any]] = []
    try:
        photon_rows = await _photon_city_suggest(query=q, country_code=cc, limit=lim * 2)
    except Exception as e:
        logger.warning("photon_city_suggest_merge_error", extra={"error": str(e)})

    merged = _merge_city_suggest_batches(merged, photon_rows)
    merged = _filter_rank_city_suggestions(merged, query=q, limit=lim)

    if not merged and rate_limited:
        logger.info("nominatim_city_suggest_rate_limited_using_photon", extra={"q": q[:40], "country": cc})

    if not merged and cc and len(q) >= 3:
        logger.info(
            "city_suggest_worldwide_fallback",
            extra={"q": q[:40], "country": cc},
        )
        worldwide: list[dict[str, Any]] = []
        seen_ww: set[str] = set()
        try:
            async with httpx.AsyncClient(
                timeout=timeout, verify=verify, trust_env=True, headers=headers
            ) as client:
                await _nominatim_throttle()
                batch, _ = await _nominatim_city_search_once(
                    query=q,
                    country_code=None,
                    base=base,
                    limit=lim,
                    client=client,
                )
                for row in batch:
                    dn = str(row.get("displayName") or "")
                    if dn and dn not in seen_ww:
                        seen_ww.add(dn)
                        worldwide.append(row)
        except httpx.RequestError as e:
            logger.warning("city_suggest_worldwide_nominatim_error", extra={"error": str(e)})
        worldwide = _filter_rank_city_suggestions(worldwide, query=q, limit=lim)
        if not worldwide:
            worldwide = await _photon_city_suggest(query=q, country_code=None, limit=lim)
        merged = worldwide

    _city_suggest_cache_set(cache_key, merged)
    return merged[:lim]


def _nominatim_tennis_search_row_ok(row: dict[str, Any]) -> bool:
    display = str(row.get("display_name") or "")
    name = str(row.get("name") or "")
    blob = f"{display} {name}"
    low = blob.lower()
    if "טניס" in blob:
        return True
    if "tennis" in low:
        return True
    cls = str(row.get("class") or "").lower()
    typ = str(row.get("type") or "").lower()
    if typ == "park" or (cls == "leisure" and typ == "park"):
        return "tennis" in low or "טניס" in blob
    if cls == "tourism" and typ == "park":
        return "tennis" in low or "טניס" in blob
    if cls == "leisure" and typ == "pitch":
        return "tennis" in low or "טניס" in blob
    if cls == "leisure" and typ == "sports_centre":
        return "tennis" in low or "טניס" in blob
    if cls == "leisure" and typ in ("stadium", "fitness_centre"):
        return "tennis" in low or "טניס" in blob
    if "court" in low and "paddle" not in low and "pickle" not in low and "basketball" not in low:
        return "tennis" in low or "טניס" in blob
    return False


def _candidate_from_nominatim_search_row(
    row: dict[str, Any],
    *,
    ritual_type_slug: str,
    center_lat: float,
    center_lon: float,
) -> dict[str, Any] | None:
    _ = ritual_type_slug
    try:
        elat = float(row["lat"])
        elon = float(row["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    display = str(row.get("display_name") or "").strip()
    nm = str(row.get("name") or "").strip()
    label = nm or (display.split(",")[0].strip() if display else "") or "Venue"
    osm_id_raw = row.get("osm_id")
    osm_type = str(row.get("osm_type") or "").lower()
    try:
        osm_id = int(osm_id_raw) if osm_id_raw is not None else 0
    except (TypeError, ValueError):
        osm_id = 0
    if osm_type in ("node", "way", "relation") and osm_id > 0:
        maps_url = _osm_maps_url(osm_type, osm_id, elat, elon)
    else:
        maps_url = f"https://www.openstreetmap.org/#map=16/{elat}/{elon}"
    dist = _haversine_m(center_lat, center_lon, elat, elon)
    tags: dict[str, str] = {}
    return {
        "name": label[:120],
        "address": display,
        "hobyRelation": "",
        "mapsUrl": maps_url,
        "placeId": f"nom-search:{osm_type}:{osm_id}" if osm_id else None,
        "rating": None,
        "types": [],
        "_dist_m": dist,
        "_lat": elat,
        "_lon": elon,
        "_tags": tags,
    }


_NOMINATIM_FALLBACK_QUERIES: dict[str, tuple[str, ...]] = {
    "tennis": ("tennis", "tennis court", "טניס"),
    "bicycle": ("bicycle trail", "bike path", "cycling route", "mountain bike trail"),
    "chess": ("chess club", "board game cafe", "library"),
    "coffee": ("coffee shop", "cafe"),
    "cooking": ("community kitchen", "cooking class"),
    "dancing": ("dance studio", "community centre dance"),
}


def _nominatim_fallback_row_ok(row: dict[str, Any], *, slug: str, max_dist_m: float, center_lat: float, center_lon: float) -> bool:
    if slug == "tennis":
        return _nominatim_tennis_search_row_ok(row)
    try:
        elat = float(row["lat"])
        elon = float(row["lon"])
    except (KeyError, TypeError, ValueError):
        return False
    if _haversine_m(center_lat, center_lon, elat, elon) > max_dist_m:
        return False
    display = str(row.get("display_name") or "")
    name = str(row.get("name") or "")
    blob = f"{display} {name}".lower()
    if slug in blob or slug.replace("_", " ") in blob:
        return True
    cls = str(row.get("class") or "").lower()
    typ = str(row.get("type") or "").lower()
    if cls == "leisure" and typ in ("park", "sports_centre", "pitch", "track", "stadium"):
        return True
    if cls == "amenity" and typ in ("cafe", "library", "community_centre", "social_facility", "arts_centre"):
        return True
    if cls == "highway" and typ in ("cycleway", "path"):
        return slug == "bicycle"
    return _haversine_m(center_lat, center_lon, elat, elon) <= min(max_dist_m, 18_000)


async def nominatim_venue_search_fallback(
    *,
    lat: float,
    lon: float,
    ritual_type_slug: str,
    ritual_subtype: str | None,
    nominatim_base: str | None = None,
    max_queries: int = 3,
    city_label: str | None = None,
    near_label: str | None = None,
) -> list[dict[str, Any]]:
    """
    Nominatim text search when Overpass yields no rows (busy mirrors, sparse tags,
    or city centroid far from mapped venues). Sorted by distance — may be outside city limits.
    """
    _ = ritual_subtype
    slug = (ritual_type_slug or "").strip().lower()
    base_queries = _NOMINATIM_FALLBACK_QUERIES.get(slug) or (slug.replace("_", " "), "sports centre", "park")
    city = (city_label or "").strip()
    country = ""
    if near_label and "," in near_label:
        country = near_label.rsplit(",", 1)[-1].strip()
    query_list: list[str] = []
    if city:
        for q in base_queries[: max(1, min(len(base_queries), max_queries))]:
            query_list.append(f"{q}, {city}")
        if len(query_list) < max_queries:
            query_list.append(f"{slug.replace('_', ' ')}, {city}")
    else:
        query_list = list(base_queries[: max(1, min(len(base_queries), max_queries))])
    span = 0.14 if city else 0.28
    min_lon, max_lat, max_lon, min_lat = lon - span, lat + span, lon + span, lat - span
    viewbox = f"{min_lon},{max_lat},{max_lon},{min_lat}"
    base = (nominatim_base or load_osm_endpoints()[0]).rstrip("/")
    url = f"{base}/search"
    headers = {
        "User-Agent": _user_agent(),
        "Accept": "application/json",
        "Accept-Language": "en,he",
    }
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(22.0)
    max_dist_m = 18_000.0 if city else 35_000.0
    gathered: list[dict[str, Any]] = []

    async def _run_queries(queries: list[str], *, bounded: bool) -> None:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            for q in queries:
                await _nominatim_throttle()
                params: dict[str, str] = {
                    "format": "json",
                    "q": q,
                    "limit": "15",
                    "addressdetails": "1",
                }
                if bounded:
                    params["bounded"] = "1"
                    params["viewbox"] = viewbox
                try:
                    r = await client.get(url, params=params)
                except httpx.RequestError:
                    continue
                if r.status_code >= 400:
                    continue
                try:
                    chunk = r.json()
                except json.JSONDecodeError:
                    continue
                if isinstance(chunk, list):
                    gathered.extend(chunk)

    try:
        await _run_queries(query_list, bounded=True)
        if len(gathered) < 3 and city:
            wide: list[str] = []
            for q in base_queries[: max(1, min(len(base_queries), max_queries))]:
                wide.append(f"{q} {city} {country}".strip())
            if len(wide) < max_queries:
                wide.append(f"{slug.replace('_', ' ')} {city} {country}".strip())
            await _run_queries(wide[: max_queries + 1], bounded=False)
    except httpx.RequestError as e:
        logger.warning("nominatim_venue_fallback_client_error", extra={"error": str(e)})
        return []

    seen: set[tuple[Any, ...]] = set()
    merged: list[dict[str, Any]] = []
    for row in gathered:
        if not isinstance(row, dict):
            continue
        if not _nominatim_fallback_row_ok(row, slug=slug, max_dist_m=max_dist_m, center_lat=lat, center_lon=lon):
            continue
        try:
            oid = int(row.get("osm_id") or 0)
        except (TypeError, ValueError):
            oid = 0
        otyp = str(row.get("osm_type") or "").lower()
        cand = _candidate_from_nominatim_search_row(row, ritual_type_slug=slug, center_lat=lat, center_lon=lon)
        if not cand:
            continue
        key: tuple[Any, ...] = (otyp, oid) if oid else (round(float(cand["_lat"]), 5), round(float(cand["_lon"]), 5))
        if key in seen:
            continue
        seen.add(key)
        merged.append(cand)

    merged.sort(key=lambda x: float(x.get("_dist_m") or 0.0))
    if merged:
        logger.info("nominatim_venue_search_fallback", extra={"slug": slug, "count": len(merged)})
    return merged[:24]


async def nominatim_reverse_display(*, lat: float, lon: float, nominatim_base: str | None = None) -> str | None:
    """Street-level-ish label for a pin (Nominatim reverse)."""
    base = (nominatim_base or load_osm_endpoints()[0]).rstrip("/")
    url = f"{base}/reverse"
    params = {"lat": lat, "lon": lon, "format": "json", "zoom": 18, "addressdetails": "1"}
    headers = {"User-Agent": _user_agent(), "Accept": "application/json"}
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(25.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            r = await client.get(url, params=params)
    except httpx.RequestError as e:
        logger.warning("nominatim_reverse_request_error", extra={"error": str(e)})
        return None
    if r.status_code >= 400:
        return None
    try:
        data = r.json()
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    label = str(data.get("display_name") or "").strip()
    return label or None


def _short_address_from_nominatim_data(data: dict[str, Any]) -> tuple[str | None, str | None]:
    """Return (poi_name, short street + city) from a Nominatim reverse JSON object."""
    addr_raw = data.get("address")
    addr = addr_raw if isinstance(addr_raw, dict) else {}

    poi_name = str(data.get("name") or "").strip()
    if not poi_name:
        for key in ("amenity", "shop", "leisure", "tourism", "office", "building"):
            poi_name = str(addr.get(key) or "").strip()
            if poi_name:
                break

    road = str(addr.get("road") or addr.get("pedestrian") or addr.get("footway") or "").strip()
    house = str(addr.get("house_number") or "").strip()
    street = f"{road} {house}".strip() if road else ""

    city = ""
    for key in ("city", "town", "village", "municipality", "suburb"):
        value = str(addr.get(key) or "").strip()
        if value:
            city = value
            break

    short_parts: list[str] = []
    if street:
        short_parts.append(street)
    if city and city.lower() != street.lower():
        short_parts.append(city)

    short_address = ", ".join(short_parts) if short_parts else None
    return poi_name or None, short_address


async def nominatim_reverse_meeting_label(
    *, lat: float, lon: float, nominatim_base: str | None = None
) -> dict[str, str | None]:
    """Reverse geocode to a short meeting-place label (POI name + street/city)."""
    base = (nominatim_base or load_osm_endpoints()[0]).rstrip("/")
    url = f"{base}/reverse"
    params = {"lat": lat, "lon": lon, "format": "json", "zoom": 18, "addressdetails": "1"}
    headers = {"User-Agent": _user_agent(), "Accept": "application/json"}
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(25.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            r = await client.get(url, params=params)
    except httpx.RequestError as e:
        logger.warning("nominatim_reverse_meeting_request_error", extra={"error": str(e)})
        return {"name": None, "shortAddress": None, "displayName": None}
    if r.status_code >= 400:
        return {"name": None, "shortAddress": None, "displayName": None}
    try:
        data = r.json()
    except json.JSONDecodeError:
        return {"name": None, "shortAddress": None, "displayName": None}
    if not isinstance(data, dict):
        return {"name": None, "shortAddress": None, "displayName": None}

    poi_name, short_address = _short_address_from_nominatim_data(data)
    display = str(data.get("display_name") or "").strip() or None
    return {"name": poi_name, "shortAddress": short_address, "displayName": display}


async def nominatim_reverse_place_hints(
    *, lat: float, lon: float, nominatim_base: str | None = None
) -> dict[str, str] | None:
    """
    Nominatim reverse at city-ish zoom for defaulting country + locality in the UI.
    Returns countryCode (ISO 3166-1 alpha-2), cityShortName, displayName.
    """
    base = (nominatim_base or load_osm_endpoints()[0]).rstrip("/")
    url = f"{base}/reverse"
    params = {"lat": lat, "lon": lon, "format": "json", "zoom": 12, "addressdetails": "1"}
    headers = {"User-Agent": _user_agent(), "Accept": "application/json"}
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(25.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            r = await client.get(url, params=params)
    except httpx.RequestError as e:
        logger.warning("nominatim_reverse_hints_request_error", extra={"error": str(e)})
        return None
    if r.status_code >= 400:
        return None
    try:
        data = r.json()
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    addr = data.get("address")
    if not isinstance(addr, dict):
        return None
    cc = str(addr.get("country_code") or "").strip().upper()
    if len(cc) != 2 or not cc.isalpha():
        return None
    city = ""
    for k in ("city", "town", "village", "municipality", "hamlet", "suburb", "county"):
        v = addr.get(k)
        if v and str(v).strip():
            city = str(v).strip()
            break
    display = str(data.get("display_name") or "").strip()
    if not city and display:
        city = display.split(",")[0].strip()
    if not city:
        return None
    return {"countryCode": cc, "cityShortName": city, "displayName": display or city}


async def photon_reverse_place_hints(*, lat: float, lon: float) -> dict[str, str] | None:
    headers = {"User-Agent": _user_agent(), "Accept": "application/json"}
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(18.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
            r = await client.get(
                f"{_PHOTON_BASE}reverse",
                params={"lat": str(lat), "lon": str(lon), "lang": "en"},
            )
    except httpx.RequestError as e:
        logger.warning("photon_reverse_request_error", extra={"error": str(e)})
        return None
    if r.status_code >= 400:
        logger.warning(
            "photon_reverse_http",
            extra={"status": r.status_code, "body": (r.text or "")[:200]},
        )
        return None
    try:
        data = r.json()
    except json.JSONDecodeError:
        return None
    features = data.get("features") if isinstance(data, dict) else None
    if not isinstance(features, list) or not features:
        return None
    props = features[0].get("properties") if isinstance(features[0], dict) else None
    if not isinstance(props, dict):
        return None
    city = ""
    for key in ("city", "name", "town", "village", "municipality", "hamlet", "suburb", "county"):
        value = str(props.get(key) or "").strip()
        if value:
            city = value
            break
    country_name = str(props.get("country") or "").strip()
    cc = ""
    if country_name:
        try:
            import pycountry

            for row in pycountry.countries:
                if str(row.name).lower() == country_name.lower():
                    cc = str(row.alpha_2).upper()
                    break
        except Exception:
            cc = ""
    if not city or len(cc) != 2:
        return None
    display_parts: list[str] = []
    for key in ("name", "city", "state", "country"):
        value = str(props.get(key) or "").strip()
        if value and value not in display_parts:
            display_parts.append(value)
    display = ", ".join(display_parts) or city
    return {"countryCode": cc, "cityShortName": city, "displayName": display}


async def reverse_place_hints_with_fallback(*, lat: float, lon: float) -> dict[str, str] | None:
    await _nominatim_throttle()
    hints = await nominatim_reverse_place_hints(lat=lat, lon=lon)
    if hints:
        return hints
    logger.info("nominatim_reverse_using_photon", extra={"lat": lat, "lon": lon})
    return await photon_reverse_place_hints(lat=lat, lon=lon)


async def fill_osm_rows_missing_addresses(rows: list[dict[str, Any]], *, max_reverse: int = 12) -> None:
    """Fill empty address using Nominatim reverse (~1 req/s public policy)."""
    need = [r for r in rows if not str(r.get("address") or "").strip()][:max_reverse]
    first = True
    for row in need:
        la, lo = row.get("_lat"), row.get("_lon")
        if la is None or lo is None:
            continue
        if not first:
            await asyncio.sleep(1.05)
        first = False
        try:
            label = await nominatim_reverse_display(lat=float(la), lon=float(lo))
        except Exception as e:
            logger.warning("nominatim_reverse_failed", extra={"error": str(e)})
            label = None
        if label:
            row["address"] = label


def dedupe_osm_near_duplicates(merged: list[dict[str, Any]], *, min_m: float = 140.0) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in merged:
        nm = (m.get("name") or "").strip().lower()
        try:
            lat_f = float(m["_lat"])
            lon_f = float(m["_lon"])
        except (KeyError, TypeError, ValueError):
            out.append(m)
            continue
        dup = False
        for o in out:
            if (o.get("name") or "").strip().lower() != nm:
                continue
            try:
                d = _haversine_m(lat_f, lon_f, float(o["_lat"]), float(o["_lon"]))
            except (KeyError, TypeError, ValueError):
                continue
            if d < min_m:
                dup = True
                break
        if not dup:
            out.append(m)
    return out


async def overpass_venues_near(
    *,
    lat: float,
    lon: float,
    ritual_type_slug: str,
    radius_m: int = 4000,
    ritual_subtype: str | None = None,
    ritual_level: int | None = None,
    fill_addresses: bool = True,
    max_mirrors: int = 2,
) -> tuple[list[dict[str, Any]], bool]:
    """
    Returns (candidates, reached_server).
    reached_server is False when every Overpass URL failed (HTTP error, timeout, overload remark).
    Callers should not retry similar queries — it usually wastes time for the same outcome.
    """
    urls = load_overpass_interpreter_urls()
    lines = _overpass_union_lines(ritual_type_slug, lat, lon, radius_m, ritual_subtype)
    query = f"[out:json][timeout:25];\n(\n{lines}\n);\nout center;\n"
    verify = load_httpx_verify_ssl()
    timeout = httpx.Timeout(55.0, connect=12.0)
    headers = {"Content-Type": "text/plain; charset=utf-8", "User-Agent": _user_agent()}
    elements: list[Any] | None = None
    last_request_error: Exception | None = None

    async with httpx.AsyncClient(timeout=timeout, verify=verify, trust_env=True, headers=headers) as client:
        for overpass_url in urls[: max(1, max_mirrors)]:
            try:
                r = await client.post(overpass_url, content=query.encode("utf-8"))
            except httpx.RequestError as e:
                logger.warning(
                    "overpass_request_error",
                    extra={"url": overpass_url, "error": str(e)},
                    exc_info=True,
                )
                last_request_error = e
                continue
            if r.status_code != 200:
                logger.warning(
                    "overpass_http",
                    extra={
                        "url": overpass_url,
                        "status": r.status_code,
                        "body": (r.text or "")[:400],
                    },
                )
                continue
            try:
                data = r.json()
            except json.JSONDecodeError:
                logger.warning(
                    "overpass_bad_json",
                    extra={"url": overpass_url, "snippet": (r.text or "")[:400]},
                )
                continue
            if not isinstance(data, dict):
                continue
            raw_elements = data.get("elements")
            remark = str(data.get("remark") or "").strip()
            if remark and not raw_elements:
                logger.warning("overpass_remark", extra={"url": overpass_url, "remark": remark[:500]})
                continue
            if not isinstance(raw_elements, list):
                continue
            elements = raw_elements
            break

    if elements is None:
        logger.warning(
            "overpass_all_endpoints_failed",
            extra={"urls": urls, "last_request_error": repr(last_request_error) if last_request_error else None},
        )
        return [], False

    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    seen_pos: set[tuple[int, int]] = set()

    for el in elements:
        if not isinstance(el, dict):
            continue
        el_type = str(el.get("type") or "")
        try:
            osm_id = int(el.get("id", 0))
        except (TypeError, ValueError):
            osm_id = 0
        tags_raw = el.get("tags")
        tags: dict[str, str] = {str(k): str(v) for k, v in tags_raw.items()} if isinstance(tags_raw, dict) else {}
        pos = _element_lat_lon(el)
        if not pos:
            continue
        elat, elon = pos
        key = (el_type, osm_id) if osm_id else ("", 0)
        if key[1] and key in seen:
            continue
        if key[1]:
            seen.add(key)
        pkey = (round(elat, 4), round(elon, 4))
        if pkey in seen_pos:
            continue
        seen_pos.add(pkey)

        name = _display_name_from_osm(tags, ritual_type_slug)
        addr = _addr_from_tags(tags).strip()
        maps_url = _osm_maps_url(el_type if el_type in ("node", "way", "relation") else "node", osm_id, elat, elon)
        dist = _haversine_m(lat, lon, elat, elon)
        merged.append(
            {
                "name": name,
                "address": addr,
                "hobyRelation": "",
                "mapsUrl": maps_url,
                "placeId": f"osm:{el_type}:{osm_id}" if osm_id else None,
                "rating": None,
                "types": [],
                "_dist_m": dist,
                "_lat": elat,
                "_lon": elon,
                "_tags": tags,
            }
        )

    if ritual_type_slug == "tennis":
        merged = filter_tennis_rows_for_surface_subtype(merged, ritual_subtype)

    merged = dedupe_osm_near_duplicates(merged)
    merged.sort(key=lambda x: float(x.get("_dist_m") or 0.0))
    if fill_addresses:
        await fill_osm_rows_missing_addresses(merged, max_reverse=3)
    for m in merged:
        tags_i = m.get("_tags") if isinstance(m.get("_tags"), dict) else {}
        m["hobyRelation"] = osm_hoby_relation(
            ritual_type_slug,
            ritual_subtype,
            tags_i,
            venue_name=str(m.get("name") or ""),
            dist_m=float(m.get("_dist_m") or 0) or None,
            ritual_level=ritual_level,
            surface_match=str(m.get("_tennis_surface_match") or "") or None,
        )
    return merged, True

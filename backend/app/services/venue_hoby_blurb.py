"""One-line explanations tying a venue to the user's selected hoby (V1 copy, English)."""
from __future__ import annotations


def _slug(s: str | None) -> str:
    return (s or "").strip().lower().replace("-", "_").replace(" ", "_")


def _sub(s: str | None) -> str:
    return _slug(s)


def _ritual_level_is_beginner(ritual_level: str | int | None) -> bool:
    if ritual_level is None:
        return False
    if isinstance(ritual_level, int):
        return ritual_level <= 1
    key = str(ritual_level).strip().lower()
    return key in {"1", "beginner", "novice", "casual", "starter"}


def _tennis_user_surface_intent(subtype: str | None) -> str | None:
    su = _sub(subtype)
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


def _dist_phrase(dist_m: float | None) -> str:
    if dist_m is None or dist_m <= 0:
        return ""
    if dist_m < 120:
        return "Very close to your search — "
    return f"About {dist_m / 1000:.1f} km from your search — "


def _tennis_surface_words(tags: dict[str, str], subtype: str) -> tuple[str, str]:
    """(surface_short, indoor_note)"""
    surface = (tags.get("surface") or "").lower().replace(" ", "_")
    covered = (tags.get("covered") or "").lower() == "yes"
    indoor = (tags.get("indoor") or "").lower() == "yes"
    sub = _sub(subtype)
    hardish = surface in ("asphalt", "concrete", "artificial_turf", "hard", "decoturf", "acrylic")
    if "hard" in sub or "hard_court" in sub:
        surf = "hard-court style"
    elif surface == "clay":
        surf = "clay surface"
    elif surface == "grass":
        surf = "grass surface"
    elif hardish:
        surf = "hard / paved surface"
    elif surface:
        surf = f"{surface.replace('_', ' ')} surface"
    else:
        surf = "court (surface not tagged in OSM)"
    note = ""
    if covered or indoor or "indoor" in sub:
        note = " Likely indoor or covered — double-check opening hours."
    return surf, note


def osm_hoby_relation(
    ritual_slug: str,
    ritual_subtype: str | None,
    tags: dict[str, str],
    *,
    venue_name: str = "",
    dist_m: float | None = None,
    ritual_level: str | int | None = None,
    surface_match: str | None = None,
) -> str:
    slug = _slug(ritual_slug)
    sub = _sub(ritual_subtype)
    is_mtb = any(k in sub for k in ("mountain", "mtb", "trail", "downhill", "enduro"))

    highway = (tags.get("highway") or "").lower()
    cycleway = (tags.get("cycleway") or "").lower()
    leisure = (tags.get("leisure") or "").lower()
    amenity = (tags.get("amenity") or "").lower()
    sport = (tags.get("sport") or "").lower()
    mtb_tag = (tags.get("mtb") or "").lower()
    dp = _dist_phrase(dist_m)
    vname = (venue_name or "").strip()

    if slug == "default":
        if leisure == "park" and tags.get("name"):
            return f"{dp}Named public park — flexible default when a more specific venue is missing."
        if amenity == "community_centre":
            return f"{dp}Community centre — practical indoor fallback for any small recurring circle."
        if leisure == "sports_centre":
            return f"{dp}Sports centre — may support several hobies; check access before choosing."
        return f"{dp}General meetup point from OpenStreetMap — confirm hours and access with your circle."

    if slug == "bicycle":
        if amenity == "bicycle_rental":
            return f"{dp}Bike rental on the map — handy if someone needs a bike at the meetup."
        if highway == "cycleway" or cycleway in ("lane", "track", "shared_lane", "yes"):
            if is_mtb:
                return f"{dp}Mapped cycling infrastructure — check surface and traffic before MTB-style riding here."
            return f"{dp}Mapped cycling infrastructure — reasonable anchor for a road-bike group meet and rollout."
        if leisure == "park" and tags.get("name"):
            return f"{dp}Named park — easy landmark to gather, then pick nearby streets or paths together."
        if highway == "path":
            if is_mtb or mtb_tag == "yes":
                return f"{dp}Path segment in OSM — may suit easier off-road segments; verify rules and surface as a group."
            return f"{dp}Path segment in OSM — can work for easy rides; confirm pavement, rules, and busy times."
        if leisure == "track" and sport == "cycling":
            return f"{dp}Cycling-related track in OSM — check if it is public and matches your ride style."
        if amenity == "community_centre":
            return f"{dp}Community centre — indoor meetup anchor; agree on a nearby route before rolling out as a group."
        if is_mtb:
            return f"{dp}OpenStreetMap cycling-related feature — use as a meet point and plan a route that fits MTB nearby."
        return f"{dp}OpenStreetMap cycling-related feature — use as a meet point and agree on a safe starter route nearby."

    if slug == "tennis":
        intent = _tennis_user_surface_intent(ritual_subtype)
        sm = (surface_match or "").strip()
        label = vname if vname.strip() else "This mapped place"

        if intent == "clay" and sm == "matched":
            return (
                f"{dp}{label}: OpenStreetMap tags a clay-compatible surface here — "
                f"matches your clay-court selection. Confirm public or club access and fees."
            )
        if intent == "clay" and sm == "unverified_clay":
            return (
                f"{dp}{label}: clay-court filter is on — OSM has no clay-tagged court in this radius, "
                f"so hard and grass surfaces were removed. This place is not verified as clay in the map data; check with the venue."
            )

        if intent == "grass" and sm == "matched":
            return (
                f"{dp}{label}: OSM tags grass — matches your grass-court selection. "
                f"Confirm booking and whether courts are maintained for play."
            )
        if intent == "grass" and sm == "unverified_grass":
            return (
                f"{dp}{label}: grass-court filter is on — no `surface=grass` tennis feature was mapped nearby; "
                f"other surfaces were excluded. Verify grass courts exist before committing."
            )

        if intent == "hard" and sm == "matched":
            return (
                f"{dp}{label}: OSM tags a hard-style surface — matches your hard-court selection. "
                f"Confirm booking or walk-on policy."
            )
        if intent == "hard" and sm == "unverified_hard":
            return (
                f"{dp}{label}: hard-court filter is on — no asphalt/concrete-style tennis surface was tagged nearby; "
                f"clay and grass were excluded. Confirm surface with the venue."
            )

        surf, indoor_note = _tennis_surface_words(tags, ritual_subtype or "")
        if sport == "tennis" or leisure == "pitch" or (leisure == "sports_centre" and sport == "tennis"):
            court_label = vname if vname and "tennis court" not in vname.lower() else "This mapped court"
            sub_hint = ""
            if _ritual_level_is_beginner(ritual_level):
                sub_hint = " Fits casual or beginner-friendly weekly play if access works."
            elif intent:
                sub_hint = " Filtered using your selected court type where OSM had surface tags."
            return (
                f"{dp}{court_label}: {surf} in OpenStreetMap.{sub_hint}"
                f"{indoor_note} Confirm booking, fees, or public access before you commit."
            )
        if leisure == "sports_centre":
            return f"{dp}Sports-centre style venue in OSM — may offer indoor or club courts; verify tennis access."
        return f"{dp}Sports or recreation spot in OSM — check courts and hours before locking this as your weekly spot."

    if slug in ("chess", "coffee"):
        if amenity == "cafe":
            return f"{dp}Café in OSM — typical low-key spot for chess or a coffee hoby circle."
        if amenity == "library":
            return f"{dp}Library in OSM — quiet tables possible; fits a calm weekly chess-style meetup."
        if amenity == "community_centre":
            return f"{dp}Community centre in OSM — indoor tables or rooms often available; solid default for a small weekly circle."
        return f"{dp}Third place in OSM — reasonable for a recurring low-key meetup; confirm noise and seating."

    if slug == "cooking":
        if amenity == "community_centre":
            return f"{dp}Community centre — often hosts classes or shared kitchens; aligns with a cooking circle."
        return f"{dp}Community-oriented venue in OSM — check if kitchen or class space fits your cooking meetup."

    if slug == "dancing":
        if leisure == "dance" or amenity == "arts_centre":
            return f"{dp}Dance or arts venue in OSM — fits a dancing hoby; confirm studio hire or public classes."
        return f"{dp}Leisure venue in OSM — check space and music policy for your dance meetup."

    if leisure == "park" and tags.get("name"):
        return f"{dp}Named park — flexible outdoor meetup point for many weekly hobies."
    if amenity == "community_centre":
        return f"{dp}Community centre — practical indoor meetup hub for a small recurring circle."

    return f"{dp}OpenStreetMap place — usable as a meetup anchor for your {slug.replace('_', ' ')} circle."


def google_hoby_relation(ritual_slug: str, ritual_subtype: str | None, place_types: list[str]) -> str:
    slug = _slug(ritual_slug)
    sub = _sub(ritual_subtype)
    types = {t.lower() for t in place_types if isinstance(t, str)}
    is_mtb = any(k in sub for k in ("mountain", "mtb", "trail", "downhill", "enduro"))

    if slug == "bicycle":
        if "bicycle_store" in types:
            return "Bike shop — good meet point if the group needs gear, air, or a known cycling landmark."
        if "park" in types:
            return "Park from Google Places — easy landmark to gather before a group ride."
        if "gym" in types or "stadium" in types or "sports_complex" in types:
            return "Sports-related venue — check if outdoor space or parking works as a ride meetup."
        if is_mtb:
            return "Google result near you — confirm trails or fire roads nearby match an MTB-style meetup."
        return "Google result near you — confirm nearby roads or paths suit your road-bike meetup."

    if slug == "tennis":
        if "gym" in types or "stadium" in types or "sports_complex" in types:
            return "Sports venue from Google — likely courts or club access; fits tennis meetups."
        return "Google place near you — check courts, surface, and booking for your tennis circle."

    if slug in ("chess", "coffee"):
        if "cafe" in types or "restaurant" in types:
            return "Café or eatery — common, low-pressure choice for chess or coffee hoby circles."
        if "library" in types:
            return "Library — quiet setting that often works for chess-style meetups."
        return "Google place near you — pick somewhere with seating and low noise for your hoby."

    if slug == "cooking":
        if "gym" in types or "school" in types:
            return "Institutional venue — may host classes; verify kitchen access for your cooking circle."
        return "Google place near you — confirm kitchen or class space fits a cooking meetup."

    if slug == "dancing":
        if "gym" in types or "night_club" in types or "spa" in types:
            return "Venue that may host movement or music — check studio hire or class schedule for dancing."
        return "Google place near you — confirm floorspace and policy for your dance meetup."

    if "park" in types:
        return "Park — flexible meetup point for many weekly hobies."
    return f"Google-suggested spot — sanity-check hours and access for your {slug.replace('_', ' ')} circle."

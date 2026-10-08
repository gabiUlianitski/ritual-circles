import json
from uuid import uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import conn_dep, get_request_lang
from app.hoby_i18n import (
    localized_display_name,
    localized_levels_types,
    localized_discovery_description,
    localized_short_description,
    parse_i18n_json,
)
from app.schemas import (
    GroupSizeSpec,
    HobyCreateRequest,
    HobyBulkRequest,
    HobyBulkResponse,
    HobyPrecheckRequest,
    HobyPrecheckResponse,
    HobyRegeneratePreview,
    HobyRegenerateRequest,
    HobyResponse,
    HobySpellSuggestRequest,
    HobySpellSuggestResponse,
    HobyUpdateRequest,
)
from app.services.hoby_precheck import precheck_new_hoby
from app.services.hoby_enrichment import (
    derive_hoby_slug,
    enrich_hoby,
    enrichment_is_saveable,
    sanitize_hoby_auxiliary,
    sanitize_hoby_metadata_lists,
)
from app.services.hoby_interest import sanitize_interest_category
from app.services.hoby_spelling import hoby_spell_suggestions

router = APIRouter(prefix="/hobies", tags=["hobies"])


@router.post("/spell-suggest", response_model=HobySpellSuggestResponse)
async def hoby_spell_suggest(
    payload: HobySpellSuggestRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
) -> HobySpellSuggestResponse:
    data = await hoby_spell_suggestions(conn, slug=payload.slug, display_name=payload.displayName)
    return HobySpellSuggestResponse(
        slugSuggestions=data["slugSuggestions"],
        displayNameSuggestions=data["displayNameSuggestions"],
    )


def _jsonb_bind(value: object | None) -> str | None:
    """asyncpg jsonb codec expects JSON text for ::jsonb binds (not raw list/dict)."""
    if value is None:
        return None
    return json.dumps(value)


def _group_size_from_row(raw: object | None) -> GroupSizeSpec | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if not isinstance(raw, dict):
        return None
    try:
        return GroupSizeSpec.model_validate(raw)
    except Exception:
        return None


def _group_size_to_json(spec: GroupSizeSpec | None) -> dict[str, object] | None:
    if spec is None:
        return None
    return spec.model_dump(exclude_none=True)


def _he_block(row: asyncpg.Record) -> dict[str, object]:
    i18n = parse_i18n_json(row.get("i18n_json"))
    block = i18n.get("he")
    return block if isinstance(block, dict) else {}


def _hoby_response_from_row(r: asyncpg.Record, lang: str = "en") -> HobyResponse:
    levels, types = localized_levels_types(r, lang)
    he = _he_block(r)
    he_name = he.get("display_name")
    he_desc = he.get("short_description")
    return HobyResponse(
        id=str(r["id"]),
        slug=r["slug"],
        displayName=localized_display_name(r, lang) or r["display_name"],
        shortDescription=localized_short_description(r, lang),
        discoveryDescription=localized_discovery_description(r, lang),
        canonicalDisplayName=r["display_name"],
        canonicalShortDescription=r["short_description"],
        heDisplayName=str(he_name).strip() if isinstance(he_name, str) and he_name.strip() else None,
        heShortDescription=str(he_desc).strip() if isinstance(he_desc, str) and he_desc.strip() else None,
        icon=r["icon"],
        levels=levels,
        types=types,
        interestCategory=sanitize_interest_category(r["interest_category"]),
        groupSize=_group_size_from_row(r.get("group_size_json")),
        archived=r.get("archived_at") is not None,
    )


_HOBY_SELECT = """
    SELECT id, slug, display_name, short_description, discovery_description, icon, levels_json, types_json, interest_category, group_size_json, i18n_json, archived_at
    FROM hobies
"""


def _row_is_complete(row: asyncpg.Record) -> bool:
    if not str(row["display_name"] or "").strip():
        return False
    if not str(row["short_description"] or "").strip():
        return False
    if sanitize_interest_category(row["interest_category"]) is None:
        return False
    if not str(row["icon"] or "").strip():
        return False
    if _json_list(row["types_json"]) is None or _types_missing_icon(row["types_json"]):
        return False
    if _json_list(row["levels_json"]) is None:
        return False
    if _group_size_from_row(row.get("group_size_json")) is None:
        return False
    he = _he_block(row)
    if not str(he.get("display_name") or "").strip():
        return False
    if not str(he.get("short_description") or "").strip():
        return False
    return True


@router.get("")
async def list_hobies(
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
    canonical: bool = False,
    includeIncomplete: bool = False,
) -> list[HobyResponse]:
    rows = await conn.fetch(f"{_HOBY_SELECT} ORDER BY display_name ASC")
    if not includeIncomplete:
        rows = [row for row in rows if _row_is_complete(row) and row.get("archived_at") is None]
    response_lang = "en" if canonical else lang
    return [_hoby_response_from_row(row, response_lang) for row in rows]


@router.post("/precheck", response_model=HobyPrecheckResponse)
async def precheck_hoby(
    payload: HobyPrecheckRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
) -> HobyPrecheckResponse:
    data = await precheck_new_hoby(conn, display_name=payload.displayName)
    return HobyPrecheckResponse(**data)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=HobyResponse)
async def create_hoby(
    payload: HobyCreateRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
) -> HobyResponse:
    dn = payload.displayName.strip()
    if not dn:
        raise HTTPException(status_code=400, detail="displayName is required")

    dup_name = await conn.fetchrow(
        "SELECT 1 FROM hobies WHERE lower(trim(display_name)) = lower(trim($1)) LIMIT 1",
        dn,
    )
    if dup_name:
        raise HTTPException(status_code=409, detail="A hoby with this display name already exists")

    base_slug = derive_hoby_slug(dn)
    slug = base_slug
    n = 2
    while await conn.fetchrow("SELECT 1 FROM hobies WHERE slug = $1", slug):
        slug = f"{base_slug}_{n}"
        n += 1
        if n > 5000:
            raise HTTPException(status_code=500, detail="could not allocate a unique slug")

    hoby_id = uuid4()

    levels = payload.levels
    types = payload.types
    short_description: str | None = None
    discovery_description: str | None = None
    icon: str | None = None
    interest_category = sanitize_interest_category(payload.interestCategory)
    i18n_json: dict | None = None
    # Name-only create uses AI. Nothing is inserted unless that enrichment is complete.
    if levels is None and types is None:
        enriched = await enrich_hoby(slug=base_slug, display_name=dn)
        if not enrichment_is_saveable(enriched):
            raise HTTPException(
                status_code=503,
                detail="We couldn't generate the hobby details. The hobby was not created.",
            )
        assert enriched is not None
        levels = enriched.get("levels")
        types = enriched.get("types")
        short_description = enriched.get("short_description")
        discovery_description = enriched.get("discovery_description")
        icon = enriched.get("icon")
        if interest_category is None:
            interest_category = sanitize_interest_category(enriched.get("interest_category"))
        if payload.groupSize is None:
            parsed_size = _group_size_from_row(enriched.get("group_size"))
            if parsed_size is not None:
                payload = payload.model_copy(update={"groupSize": parsed_size})
        i18n_json = {
            "he": {
                "display_name": enriched.get("he_display_name"),
                "short_description": enriched.get("he_short_description"),
                "discovery_description": enriched.get("he_discovery_description"),
            }
        }
    else:
        short_description = payload.shortDescription
        icon = payload.icon

    levels, types = sanitize_hoby_metadata_lists(levels, types)
    short_description, icon = sanitize_hoby_auxiliary(short_description, icon)
    group_size_json = _group_size_to_json(payload.groupSize)

    await conn.execute(
        """
        INSERT INTO hobies (
          id, slug, display_name, short_description, discovery_description, icon, levels_json, types_json, interest_category, group_size_json, i18n_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb, $11::jsonb)
        """,
        hoby_id,
        slug,
        dn,
        short_description,
        discovery_description,
        icon,
        _jsonb_bind(levels),
        _jsonb_bind(types),
        interest_category,
        _jsonb_bind(group_size_json),
        _jsonb_bind(i18n_json),
    )
    row = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug)
    assert row is not None
    return _hoby_response_from_row(row, lang)


async def _circle_count(conn: asyncpg.Connection, slug: str) -> int:
    count = await conn.fetchval(
        """
        SELECT COUNT(*)::int
        FROM circles
        WHERE lower(trim("ritualType")) = lower(trim($1))
        """,
        slug,
    )
    return int(count or 0)


async def _archive_slug(conn: asyncpg.Connection, slug: str) -> bool:
    result = await conn.execute(
        "UPDATE hobies SET archived_at = COALESCE(archived_at, NOW()) WHERE slug = $1",
        slug,
    )
    return result.endswith("1")


@router.post("/bulk", response_model=HobyBulkResponse)
async def bulk_hobies(
    payload: HobyBulkRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
) -> HobyBulkResponse:
    slugs = [slug.strip() for slug in payload.slugs if slug and slug.strip()]
    result = HobyBulkResponse()
    for slug in dict.fromkeys(slugs):
        row = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug)
        if not row:
            result.failed.append(slug)
            continue
        if payload.action == "archive":
            if await _archive_slug(conn, slug):
                result.archived.append(slug)
            else:
                result.failed.append(slug)
        elif payload.action == "delete":
            if await _circle_count(conn, slug) > 0:
                result.blocked.append(slug)
                continue
            await conn.execute("DELETE FROM hobies WHERE slug = $1", slug)
            result.deleted.append(slug)
        else:
            enriched = await enrich_hoby(slug=slug, display_name=row["display_name"])
            if not enriched:
                result.failed.append(slug)
                continue
            await _apply_enrichment(conn, row, enriched)
            result.regenerated.append(slug)
    return result


@router.get("/{slug}/usage")
async def hoby_usage(slug: str, conn: asyncpg.Connection = Depends(conn_dep)) -> dict[str, int]:
    slug_s = slug.strip()
    row = await conn.fetchrow("SELECT 1 FROM hobies WHERE slug = $1", slug_s)
    if not row:
        raise HTTPException(status_code=404, detail="hoby not found")
    return {"circleCount": await _circle_count(conn, slug_s)}


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hoby(slug: str, conn: asyncpg.Connection = Depends(conn_dep)) -> None:
    slug_s = slug.strip()
    row = await conn.fetchrow("SELECT 1 FROM hobies WHERE slug = $1", slug_s)
    if not row:
        raise HTTPException(status_code=404, detail="hoby not found")
    if await _circle_count(conn, slug_s) > 0:
        raise HTTPException(status_code=409, detail="referenced")
    await conn.execute("DELETE FROM hobies WHERE slug = $1", slug_s)


@router.post("/{slug}/archive", response_model=HobyResponse)
async def archive_hoby(
    slug: str,
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
) -> HobyResponse:
    slug_s = slug.strip()
    if not await _archive_slug(conn, slug_s):
        raise HTTPException(status_code=404, detail="hoby not found")
    row = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug_s)
    assert row is not None
    return _hoby_response_from_row(row, lang)


@router.post("/{slug}/restore", response_model=HobyResponse)
async def restore_hoby(
    slug: str,
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
) -> HobyResponse:
    slug_s = slug.strip()
    result = await conn.execute("UPDATE hobies SET archived_at = NULL WHERE slug = $1", slug_s)
    if not result.endswith("1"):
        raise HTTPException(status_code=404, detail="hoby not found")
    row = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug_s)
    assert row is not None
    return _hoby_response_from_row(row, lang)


async def _apply_enrichment(conn: asyncpg.Connection, row: asyncpg.Record, enriched: dict) -> None:
    levels, types = sanitize_hoby_metadata_lists(enriched.get("levels"), enriched.get("types"))
    short_description, icon = sanitize_hoby_auxiliary(enriched.get("short_description"), enriched.get("icon"))
    group_size = _group_size_from_row(enriched.get("group_size"))
    i18n = parse_i18n_json(row.get("i18n_json"))
    he = i18n.get("he")
    he_out = dict(he) if isinstance(he, dict) else {}
    if enriched.get("he_display_name"):
        he_out["display_name"] = enriched["he_display_name"]
    if enriched.get("he_short_description"):
        he_out["short_description"] = enriched["he_short_description"]
    if enriched.get("he_discovery_description"):
        he_out["discovery_description"] = enriched["he_discovery_description"]
    if he_out:
        i18n["he"] = he_out
    await conn.execute(
        """
        UPDATE hobies
        SET short_description = COALESCE($1, short_description),
            discovery_description = COALESCE($2, discovery_description),
            icon = COALESCE($3, icon),
            levels_json = COALESCE($4::jsonb, levels_json),
            types_json = COALESCE($5::jsonb, types_json),
            interest_category = COALESCE($6, interest_category),
            group_size_json = COALESCE($7::jsonb, group_size_json),
            i18n_json = $8::jsonb
        WHERE slug = $9
        """,
        short_description,
        enriched.get("discovery_description"),
        icon,
        _jsonb_bind(levels),
        _jsonb_bind(types),
        sanitize_interest_category(enriched.get("interest_category")),
        _jsonb_bind(_group_size_to_json(group_size)),
        _jsonb_bind(i18n),
        row["slug"],
    )


@router.patch("/{slug}", response_model=HobyResponse)
async def update_hoby(
    slug: str,
    payload: HobyUpdateRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
) -> HobyResponse:
    slug_s = slug.strip()
    if not slug_s:
        raise HTTPException(status_code=400, detail="slug is required")

    row = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug_s)
    if not row:
        raise HTTPException(status_code=404, detail="hoby not found")

    dn = row["display_name"]
    if payload.displayName is not None:
        dn = payload.displayName.strip()
        if not dn:
            raise HTTPException(status_code=400, detail="displayName cannot be empty")
        dup_name = await conn.fetchrow(
            """
            SELECT 1 FROM hobies
            WHERE lower(trim(display_name)) = lower(trim($1)) AND slug <> $2
            LIMIT 1
            """,
            dn,
            slug_s,
        )
        if dup_name:
            raise HTTPException(status_code=409, detail="A hoby with this display name already exists")

    short_description = row["short_description"]
    if payload.shortDescription is not None:
        short_description, _ = sanitize_hoby_auxiliary(payload.shortDescription, None)

    icon = row["icon"]
    if payload.icon is not None:
        _, icon = sanitize_hoby_auxiliary(None, payload.icon)

    levels = row["levels_json"]
    types = row["types_json"]
    if payload.levels is not None or payload.types is not None:
        levels, types = sanitize_hoby_metadata_lists(
            payload.levels if payload.levels is not None else levels,
            payload.types if payload.types is not None else types,
        )

    interest_category = row["interest_category"]
    if payload.interestCategory is not None:
        interest_category = sanitize_interest_category(payload.interestCategory)

    group_size_json = row["group_size_json"]
    if payload.groupSize is not None:
        group_size_json = _group_size_to_json(payload.groupSize)

    i18n = parse_i18n_json(row.get("i18n_json"))
    changed_he = "heDisplayName" in payload.model_fields_set or "heShortDescription" in payload.model_fields_set
    if changed_he:
        he = i18n.get("he")
        he_out = dict(he) if isinstance(he, dict) else {}
        if "heDisplayName" in payload.model_fields_set:
            name = (payload.heDisplayName or "").strip()
            if name:
                he_out["display_name"] = name
            else:
                he_out.pop("display_name", None)
        if "heShortDescription" in payload.model_fields_set:
            desc = (payload.heShortDescription or "").strip()
            if desc:
                he_out["short_description"] = desc
            else:
                he_out.pop("short_description", None)
        i18n["he"] = he_out

    await conn.execute(
        """
        UPDATE hobies
        SET display_name = $1,
            short_description = $2,
            icon = $3,
            levels_json = $4::jsonb,
            types_json = $5::jsonb,
            interest_category = $6,
            group_size_json = $7::jsonb
        WHERE slug = $8
        """,
        dn,
        short_description,
        icon,
        _jsonb_bind(levels),
        _jsonb_bind(types),
        interest_category,
        _jsonb_bind(group_size_json),
        slug_s,
    )
    if changed_he:
        await conn.execute(
            "UPDATE hobies SET i18n_json = $1::jsonb WHERE slug = $2",
            _jsonb_bind(i18n),
            slug_s,
        )

    updated = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug_s)
    assert updated is not None
    return _hoby_response_from_row(updated, lang)


def _json_list(raw: object) -> list[object] | None:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    return raw if isinstance(raw, list) and len(raw) > 0 else None


def _types_missing_icon(raw: object) -> bool:
    items = _json_list(raw)
    if items is None:
        return True
    for item in items:
        if not isinstance(item, dict) or not str(item.get("icon") or "").strip():
            return True
    return False


def _field_missing(row: asyncpg.Record, field: str) -> bool:
    if field == "description":
        return not str(row["short_description"] or "").strip()
    if field == "icon":
        return not str(row["icon"] or "").strip()
    if field == "category":
        return sanitize_interest_category(row["interest_category"]) is None
    if field == "types":
        return _json_list(row["types_json"]) is None or _types_missing_icon(row["types_json"])
    if field == "levels":
        return _json_list(row["levels_json"]) is None
    if field == "groupSize":
        return _group_size_from_row(row.get("group_size_json")) is None
    return False


@router.post("/{slug}/regenerate", response_model=HobyRegeneratePreview)
async def regenerate_hoby(
    slug: str,
    payload: HobyRegenerateRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
) -> HobyRegeneratePreview:
    """Return AI suggestions for the chosen fields. Does not write the hobby."""
    slug_s = slug.strip()
    if not slug_s:
        raise HTTPException(status_code=400, detail="slug is required")
    requested = list(dict.fromkeys(payload.fields))
    if not requested:
        raise HTTPException(status_code=400, detail="Choose at least one field to regenerate")

    row = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug_s)
    if not row:
        raise HTTPException(status_code=404, detail="hoby not found")

    targets = [field for field in requested if not payload.onlyMissing or _field_missing(row, field)]
    if not targets:
        return HobyRegeneratePreview(fields=[])

    enriched = await enrich_hoby(slug=slug_s, display_name=row["display_name"])
    if not enriched:
        raise HTTPException(status_code=503, detail="We couldn’t prepare the Hobby details.")

    preview = HobyRegeneratePreview()
    applied: list[str] = []
    if "description" in targets and enriched.get("short_description"):
        preview.shortDescription = enriched["short_description"]
        applied.append("description")
    if "icon" in targets and enriched.get("icon"):
        preview.icon = enriched["icon"]
        applied.append("icon")
    if "category" in targets and enriched.get("interest_category"):
        preview.interestCategory = enriched["interest_category"]
        applied.append("category")
    if "types" in targets and enriched.get("types"):
        preview.types = enriched["types"]
        applied.append("types")
    if "levels" in targets and enriched.get("levels"):
        preview.levels = enriched["levels"]
        applied.append("levels")
    if "groupSize" in targets and enriched.get("group_size"):
        preview.groupSize = _group_size_from_row(enriched["group_size"])
        if preview.groupSize is not None:
            applied.append("groupSize")
    if not applied:
        raise HTTPException(status_code=503, detail="We couldn’t prepare the Hobby details.")
    preview.fields = applied
    return preview


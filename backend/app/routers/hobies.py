import json
from uuid import uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import conn_dep, get_request_lang
from app.hoby_i18n import (
    localized_display_name,
    localized_interest_category,
    localized_levels_types,
    localized_short_description,
)
from app.schemas import (
    GroupSizeSpec,
    HobyCreateRequest,
    HobyPrecheckRequest,
    HobyPrecheckResponse,
    HobyResponse,
    HobySpellSuggestRequest,
    HobySpellSuggestResponse,
    HobyUpdateRequest,
)
from app.services.hoby_precheck import precheck_new_hoby
from app.services.hoby_enrichment import (
    derive_hoby_slug,
    enrich_hoby,
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


def _hoby_response_from_row(r: asyncpg.Record, lang: str = "en") -> HobyResponse:
    levels, types = localized_levels_types(r, lang)
    return HobyResponse(
        id=str(r["id"]),
        slug=r["slug"],
        displayName=localized_display_name(r, lang) or r["display_name"],
        shortDescription=localized_short_description(r, lang),
        icon=r["icon"],
        levels=levels,
        types=types,
        interestCategory=localized_interest_category(r["interest_category"], lang),
        groupSize=_group_size_from_row(r.get("group_size_json")),
    )


_HOBY_SELECT = """
    SELECT id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, i18n_json
    FROM hobies
"""


@router.get("")
async def list_hobies(
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
) -> list[HobyResponse]:
    rows = await conn.fetch(f"{_HOBY_SELECT} ORDER BY display_name ASC")
    return [_hoby_response_from_row(r, lang) for r in rows]


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
    icon: str | None = None
    interest_category = sanitize_interest_category(payload.interestCategory)
    # Optional AI enrichment: only if not provided.
    if levels is None and types is None:
        enriched = await enrich_hoby(slug=base_slug, display_name=dn)
        if enriched:
            levels = enriched.get("levels")
            types = enriched.get("types")
            short_description = enriched.get("short_description")
            icon = enriched.get("icon")
            if interest_category is None:
                interest_category = sanitize_interest_category(enriched.get("interest_category"))
    else:
        short_description = payload.shortDescription
        icon = payload.icon

    levels, types = sanitize_hoby_metadata_lists(levels, types)
    short_description, icon = sanitize_hoby_auxiliary(short_description, icon)
    group_size_json = _group_size_to_json(payload.groupSize)

    await conn.execute(
        """
        INSERT INTO hobies (
          id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb)
        """,
        hoby_id,
        slug,
        dn,
        short_description,
        icon,
        _jsonb_bind(levels),
        _jsonb_bind(types),
        interest_category,
        _jsonb_bind(group_size_json),
    )
    row = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug)
    assert row is not None
    return _hoby_response_from_row(row, lang)


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

    updated = await conn.fetchrow(f"{_HOBY_SELECT} WHERE slug = $1", slug_s)
    assert updated is not None
    return _hoby_response_from_row(updated, lang)


"""Admin library generation and the daily read Home uses. Home never calls the model."""

from __future__ import annotations

import re
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import conn_dep, get_current_user, get_request_lang, CurrentUser
from app.schemas import (
    DailyLibraryInsight,
    GenerateInsightLibraryRequest,
    GenerateInsightLibraryResponse,
    InsightLibraryPreview,
    InsightLibrarySummary,
)
from app.services.hobby_insight_library import (
    InsightValidationError,
    admin_allowlist,
    catalogue_admin_allowed,
    create_insight_library,
    select_daily_insight,
)

router = APIRouter(prefix="/hobby-insights", tags=["hobby-insights"])

_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


async def _require_catalogue_admin(conn: asyncpg.Connection, user: CurrentUser) -> None:
    email = await conn.fetchval("SELECT email FROM users WHERE id = $1", user.id)
    if not catalogue_admin_allowed(authenticated=True, email=email, allowlist=admin_allowlist()):
        raise HTTPException(status_code=403, detail="Catalogue admin required")


@router.post("/generate", response_model=GenerateInsightLibraryResponse)
async def generate_insight_library(
    payload: GenerateInsightLibraryRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> GenerateInsightLibraryResponse:
    await _require_catalogue_admin(conn, user)
    try:
        result = await create_insight_library(conn, hobby_id=payload.hobbyId)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Hobby not found") from exc
    except InsightValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except asyncpg.UndefinedTableError as exc:
        raise HTTPException(
            status_code=503,
            detail="Insight storage is not ready. Existing insights were preserved.",
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return GenerateInsightLibraryResponse(
        hobbyId=result["hobbyId"],
        hobbyName=result["hobbyName"],
        activeCount=result["activeCount"],
        batchId=result["batchId"],
        preview=[InsightLibraryPreview(**item) for item in result["preview"]],
    )


@router.get("/summary", response_model=InsightLibrarySummary)
async def insight_summary(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> InsightLibrarySummary:
    await _require_catalogue_admin(conn, user)
    try:
        rows = await conn.fetch(
            """
            SELECT hobby_id::text AS "hobbyId",
                   COUNT(*)::int AS "activeCount",
                   COUNT(*) FILTER (WHERE insight_type = 'discovery')::int AS discovery,
                   COUNT(*) FILTER (WHERE insight_type = 'motivation')::int AS motivation,
                   COUNT(*) FILTER (WHERE insight_type = 'social_connection')::int AS social,
                   COUNT(*) FILTER (WHERE insight_type = 'interesting_fact')::int AS fact,
                   MAX(created_at) AS "generatedAt"
            FROM hobby_insights
            WHERE is_active = true
            GROUP BY hobby_id
            """
        )
    except asyncpg.UndefinedTableError:
        return InsightLibrarySummary(counts=[])
    return InsightLibrarySummary(
        counts=[
            {
                "hobbyId": row["hobbyId"],
                "activeCount": int(row["activeCount"]),
                "generatedAt": row["generatedAt"],
                "discovery": int(row["discovery"]),
                "motivation": int(row["motivation"]),
                "social": int(row["social"]),
                "fact": int(row["fact"]),
            }
            for row in rows
        ]
    )


@router.get("/daily", response_model=DailyLibraryInsight)
async def daily_library_insight(
    slug: str = Query(min_length=1),
    day: str = Query(min_length=10, max_length=10),
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
) -> DailyLibraryInsight:
    if not _DAY.match(day):
        raise HTTPException(status_code=400, detail="day must be YYYY-MM-DD")
    hobby = await conn.fetchrow(
        """
        SELECT id::text AS id
        FROM hobies
        WHERE lower(trim(slug)) = lower(trim($1))
        """,
        slug,
    )
    if hobby is None:
        raise HTTPException(status_code=404, detail="No active insights")
    try:
        rows = await conn.fetch(
            """
            SELECT id::text AS id, insight_type, content_en, content_he
            FROM hobby_insights
            WHERE hobby_id = $1 AND is_active = true
            """,
            UUID(hobby["id"]),
        )
    except asyncpg.UndefinedTableError as exc:
        raise HTTPException(status_code=404, detail="No active insights") from exc
    chosen = select_daily_insight(
        [
            {
                "id": row["id"],
                "insight_type": row["insight_type"],
                "content_en": row["content_en"],
                "content_he": row["content_he"],
                "is_active": True,
            }
            for row in rows
        ],
        hobby["id"],
        day,
    )
    if chosen is None:
        raise HTTPException(status_code=404, detail="No active insights")
    hebrew = str(chosen.get("content_he") or "").strip()
    text = hebrew if lang.lower().startswith("he") and hebrew else str(chosen["content_en"])
    return DailyLibraryInsight(
        hobbyId=hobby["id"],
        insightType=str(chosen["insight_type"]),
        text=text,
        day=day,
    )

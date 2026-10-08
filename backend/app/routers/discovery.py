import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from app.deps import conn_dep, get_request_lang
from app.schemas import DailyInsightResponse, DiscoveryRequest, DiscoveryResponse
from app.services.discovery_service import generate_discovery, get_daily_insight

router = APIRouter(prefix="/discoveries", tags=["discoveries"])


@router.get("/today", response_model=DailyInsightResponse)
async def daily_insight(
    slug: str,
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
) -> DailyInsightResponse:
    result = await get_daily_insight(conn, slug=slug, lang=lang)
    if result is None:
        raise HTTPException(status_code=503, detail="Insight unavailable")
    return DailyInsightResponse(**result)


@router.post("/today", response_model=DiscoveryResponse)
async def todays_discovery(
    payload: DiscoveryRequest,
    lang: str = Depends(get_request_lang),
) -> DiscoveryResponse:
    language = (payload.lang or lang or "en").strip()
    result = await generate_discovery(
        display_name=payload.displayName,
        category=payload.category,
        lang=language,
    )
    if result is None:
        # The client shows a catalog spotlight instead.
        raise HTTPException(status_code=503, detail="Discovery unavailable")
    return DiscoveryResponse(**result)

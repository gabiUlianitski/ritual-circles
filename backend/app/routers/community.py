from __future__ import annotations

from fastapi import APIRouter, Depends
import asyncpg

from app.deps import conn_dep, get_request_lang
from app.schemas import CommunityPreviewResponse
from app.services.community_service import get_community_preview

router = APIRouter(prefix="/community", tags=["community"])


@router.get("/preview", response_model=CommunityPreviewResponse)
async def community_preview(
    conn: asyncpg.Connection = Depends(conn_dep),
    lang: str = Depends(get_request_lang),
) -> CommunityPreviewResponse:
    data = await get_community_preview(conn, lang=lang)
    return CommunityPreviewResponse(**data)

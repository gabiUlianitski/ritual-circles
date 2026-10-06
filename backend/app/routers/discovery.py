from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_request_lang
from app.schemas import DiscoveryRequest, DiscoveryResponse
from app.services.discovery_service import generate_discovery

router = APIRouter(prefix="/discoveries", tags=["discoveries"])


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

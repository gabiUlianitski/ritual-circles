from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pycountry import countries

from app.deps import CurrentUser, get_current_user
from app.schemas import CitySuggestItem, CountryItem, LanguageItem, MapsLinkResolveResponse, ReverseLocateResponse
from app.services.google_maps_link import resolve_google_maps_link
from app.services.language_suggest import language_suggest as search_languages
from app.services.osm_venues import nominatim_city_suggest, reverse_place_hints_with_fallback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/geo", tags=["geo"])


@router.get("/countries", response_model=list[CountryItem])
async def list_countries(_: CurrentUser = Depends(get_current_user)) -> list[CountryItem]:
    items = [CountryItem(code=c.alpha_2, name=c.name) for c in countries if c.alpha_2]
    items.sort(key=lambda x: x.name.lower())
    return items


@router.get("/language-suggest", response_model=list[LanguageItem])
async def language_suggest_route(
    q: str = Query("", min_length=1, max_length=80),
    _: CurrentUser = Depends(get_current_user),
) -> list[LanguageItem]:
    raw = search_languages(query=q.strip(), limit=12)
    return [LanguageItem(**x) for x in raw]


@router.get("/city-suggest", response_model=list[CitySuggestItem])
async def city_suggest(
    q: str = Query("", min_length=2, max_length=120),
    country: str | None = Query(
        None,
        min_length=2,
        max_length=2,
        description="Optional ISO 3166-1 alpha-2 bias (omit for worldwide search)",
    ),
    _: CurrentUser = Depends(get_current_user),
) -> list[CitySuggestItem]:
    cc: str | None = None
    if country is not None and country.strip():
        cc = country.strip().upper()
        if len(cc) != 2 or not cc.isalpha():
            raise HTTPException(status_code=400, detail="country must be a 2-letter ISO code")
    raw = await nominatim_city_suggest(query=q.strip(), country_code=cc, limit=10)
    return [CitySuggestItem(**x) for x in raw]


@router.get("/reverse-locate", response_model=ReverseLocateResponse)
async def reverse_locate(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    _: CurrentUser = Depends(get_current_user),
) -> ReverseLocateResponse:
    hints = await reverse_place_hints_with_fallback(lat=lat, lon=lon)
    if not hints:
        raise HTTPException(status_code=404, detail="Could not resolve place from coordinates")
    return ReverseLocateResponse(**hints)


@router.get("/resolve-maps-link", response_model=MapsLinkResolveResponse)
async def resolve_maps_link(
    url: str = Query(..., min_length=8, max_length=2048),
    _: CurrentUser = Depends(get_current_user),
) -> MapsLinkResolveResponse:
    try:
        resolved = await resolve_google_maps_link(url.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.warning("resolve_maps_link_failed", extra={"error": str(e)})
        raise HTTPException(status_code=502, detail="Could not resolve that Google Maps link.") from e
    return MapsLinkResolveResponse(**resolved)

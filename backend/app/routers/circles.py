import asyncio
import logging
from uuid import UUID

import asyncpg

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas import (
    CircleCreateRequest,
    CircleJoinByIdRequest,
    CircleLeaveRequest,
    CircleListItemResponse,
    CircleMeResponse,
    CircleNextSessionRoster,
    CircleMemberAttendanceItem,
    CirclePatchRequest,
    CircleSuggestionActionRequest,
    CircleResponse,
    JoinCircleResponse,
    MapCenter,
    VenueSuggestionItem,
    VenueSuggestionsRequest,
    VenueSuggestionsResponse,
)
from app.deps import CurrentUser, conn_dep, get_current_user
from app.user_availability_windows import availability_windows_from_row
from app.user_hobbies import pick_hobby_for_slug
from app.services.circle_suggestions import respond_to_circle_suggestion
from app.services.circles_service import create_circle as create_circle_svc
from app.services.circles_service import get_circle_me as get_circle_me_svc
from app.services.circles_service import get_next_session_attendance_roster
from app.services.circles_service import join_circle as join_circle_svc
from app.services.circles_service import join_circle_open as join_circle_open_svc
from app.services.circles_service import drop_circle as drop_circle_svc
from app.services.circles_service import leave_circle as leave_circle_svc
from app.services.circles_service import patch_circle as patch_circle_svc
from app.services.circles_service import _circle_response_from_row, hoby_meta_for_ritual_type, list_circles_catalog
from app.services.osm_venues import geocode_address_with_fallback
from app.services.venue_suggestions import suggest_venues_near_address, _suggest_osm_nominatim_only

router = APIRouter(prefix="/circles", tags=["circles"])
logger = logging.getLogger(__name__)


@router.post("/venue-suggestions", response_model=VenueSuggestionsResponse)
async def venue_suggestions(
    payload: VenueSuggestionsRequest,
    _: CurrentUser = Depends(get_current_user),
) -> VenueSuggestionsResponse:
    if not payload.address.strip():
        raise HTTPException(status_code=400, detail="address is required")
    if not payload.ritualType.strip():
        raise HTTPException(status_code=400, detail="ritualType is required")
    try:
        async with asyncio.timeout(95):
            items, near, center_lat, center_lon = await suggest_venues_near_address(
                address=payload.address.strip(),
                ritual_type=payload.ritualType.strip(),
                ritual_subtype=payload.ritualSubtype.strip() if payload.ritualSubtype else None,
                ritual_level=payload.ritualLevel,
            )
    except TimeoutError as e:
        logger.warning("venue_suggestions_router_timeout", extra={"address": payload.address[:80]})
        items: list = []
        near: str | None = None
        center_lat: float | None = None
        center_lon: float | None = None
        try:
            async with asyncio.timeout(35):
                items, near, center_lat, center_lon = await _suggest_osm_nominatim_only(
                    address=payload.address.strip(),
                    ritual_type=payload.ritualType.strip(),
                    ritual_subtype=payload.ritualSubtype.strip() if payload.ritualSubtype else None,
                    ritual_level=payload.ritualLevel,
                )
        except (TimeoutError, ValueError, RuntimeError):
            items = []
        if not items:
            try:
                geo = await asyncio.wait_for(
                    geocode_address_with_fallback(address=payload.address.strip()),
                    timeout=18.0,
                )
                if geo:
                    near = str(geo.get("formatted_address") or payload.address.strip())
                    center_lat = geo["lat"]
                    center_lon = geo["lng"]
            except (TimeoutError, ValueError, RuntimeError):
                pass
        if not items and center_lat is None:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Place search is taking longer than usual. Wait a minute and try again, "
                    "paste a Google Maps link below, or pick a meeting spot manually."
                ),
            ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.warning("venue_suggestions_failed", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(status_code=502, detail="Venue search failed") from e
    map_center: MapCenter | None = None
    if center_lat is not None and center_lon is not None:
        map_center = MapCenter(lat=center_lat, lon=center_lon)
    return VenueSuggestionsResponse(
        suggestions=[VenueSuggestionItem(**x) for x in items],
        geocodedNear=near,
        mapCenter=map_center,
    )


@router.get("", response_model=list[CircleListItemResponse])
async def list_circles(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> list[CircleListItemResponse]:
    rows = await list_circles_catalog(conn, user_id=user.id)
    return [CircleListItemResponse(**r) for r in rows]


@router.post("", response_model=CircleResponse)
async def create_circle(
    payload: CircleCreateRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> CircleResponse:
    return await create_circle_svc(conn, user_id=user.id, payload=payload)


@router.post("/{circleId}/messages/{messageId}/suggestion", response_model=CircleResponse)
async def respond_to_suggestion(
    circleId: str,
    messageId: str,
    payload: CircleSuggestionActionRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> CircleResponse:
    try:
        cid = UUID(circleId.strip())
        mid = UUID(messageId.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid circleId or messageId") from e
    result = await respond_to_circle_suggestion(
        conn,
        user_id=user.id,
        circle_id=cid,
        message_id=mid,
        accept=payload.action == "accept",
        first_session_at=payload.firstSessionAt,
        recurring_time=payload.recurringTime,
        is_recurring=payload.isRecurring,
    )
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to apply suggestion")
    return result


@router.patch("/{circleId}", response_model=CircleResponse)
async def patch_circle(
    circleId: str,
    payload: CirclePatchRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> CircleResponse:
    try:
        cid = UUID(circleId.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid circleId") from e
    return await patch_circle_svc(
        conn,
        user_id=user.id,
        circle_id=cid,
        invite_only=payload.inviteOnly,
        group_size=payload.groupSize,
        cost_payment=payload.costPayment,
        first_session_at=payload.firstSessionAt,
        recurring_time=payload.recurringTime,
        is_recurring=payload.isRecurring,
        meeting_place_update=payload.meetingPlaceUpdate,
    )


@router.post("/join/{inviteCode}", response_model=JoinCircleResponse)
async def join_circle(
    inviteCode: str,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> JoinCircleResponse:
    return await join_circle_svc(conn, user_id=user.id, invite_code=inviteCode)


@router.post("/join-open", response_model=JoinCircleResponse)
async def join_circle_open(
    payload: CircleJoinByIdRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> JoinCircleResponse:
    try:
        cid = UUID(payload.circleId.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid circleId") from e
    return await join_circle_open_svc(conn, user_id=user.id, circle_id=cid)


@router.post("/leave")
async def leave_circle(
    payload: CircleLeaveRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    try:
        circle_id = UUID(payload.circleId)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid circleId") from e
    await leave_circle_svc(conn, user_id=user.id, circle_id=circle_id)
    return {"ok": True}


@router.post("/drop")
async def drop_circle(
    payload: CircleLeaveRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    try:
        circle_id = UUID(payload.circleId)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid circleId") from e
    await drop_circle_svc(conn, user_id=user.id, circle_id=circle_id)
    return {"ok": True}


@router.get("/me", response_model=CircleMeResponse)
async def get_my_circle(
    circleId: str | None = Query(None, description="When set, return this circle if the user is a member (future sessions)."),
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> CircleMeResponse:
    cid: UUID | None = None
    if circleId is not None and circleId.strip():
        try:
            cid = UUID(circleId.strip())
        except ValueError as e:
            raise HTTPException(status_code=400, detail="invalid circleId") from e
    circle_row, members_rows = await get_circle_me_svc(conn, user_id=user.id, circle_id=cid)
    if circle_row is None:
        if cid is not None:
            raise HTTPException(status_code=404, detail="no circle")
        return CircleMeResponse(circle=None, members=[])
    hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, circle_row["ritualType"])
    circle = _circle_response_from_row(circle_row, hoby_name=hoby_name, hoby_icon=hoby_icon)
    ritual_slug = str(circle_row["ritualType"] or "")
    members = []
    for r in members_rows:
        match = pick_hobby_for_slug(r, ritual_slug)
        members.append(
            {
                "id": str(r["id"]),
                "user_name": r["user_name"],
                "first_name": r["first_name"],
                "last_name": r["last_name"],
                "city": r["city"],
                "availabilityWindows": availability_windows_from_row(r),
                "availability_day": r["availability_day"],
                "availability_time": r["availability_time"],
                "hobby_subtype": match.subtype if match else None,
                "hobby_level": match.level if match else None,
            }
        )
    roster_raw = await get_next_session_attendance_roster(conn, circle_id=circle_row["id"])
    next_session_roster: CircleNextSessionRoster | None = None
    if roster_raw:
        next_session_roster = CircleNextSessionRoster(
            sessionId=str(roster_raw["sessionId"]),
            dateTime=roster_raw["dateTime"],
            members=[CircleMemberAttendanceItem(**m) for m in roster_raw["members"]],
        )
    is_creator = circle_row.get("created_by") == user.id
    creator_id = circle_row.get("created_by")
    return CircleMeResponse(
        circle=circle,
        members=members,
        nextSessionRoster=next_session_roster,
        isCreator=bool(is_creator),
        creatorUserId=str(creator_id) if creator_id is not None else None,
    )


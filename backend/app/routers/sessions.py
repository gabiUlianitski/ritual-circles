from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.schemas import SessionResponse
from app.deps import CurrentUser, conn_dep, get_current_user
from app.services.sessions_service import get_next_session_for_user, list_future_sessions_for_user

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/next", response_model=SessionResponse | None)
async def get_next_session(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> SessionResponse | None:
    row = await get_next_session_for_user(conn, user_id=user.id)
    if not row:
        return None
    return SessionResponse(
        id=str(row["id"]),
        circleId=str(row["circleId"]),
        dateTime=row["dateTime"],
        locationOrLink=row["locationOrLink"],
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> list[SessionResponse]:
    rows = await list_future_sessions_for_user(conn, user_id=user.id, limit=6)
    return [
        SessionResponse(
            id=str(r["id"]),
            circleId=str(r["circleId"]),
            dateTime=r["dateTime"],
            locationOrLink=r["locationOrLink"],
        )
        for r in rows
    ]


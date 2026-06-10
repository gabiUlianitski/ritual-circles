from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.schemas import AttendanceResponse, AttendanceUpsertRequest
from app.deps import CurrentUser, conn_dep, get_current_user
from app.services.attendance_service import update_attendance

router = APIRouter(prefix="/sessions", tags=["attendance"])


@router.put("/{sessionId}/attendance", response_model=AttendanceResponse)
async def upsert_attendance(
    sessionId: str,
    payload: AttendanceUpsertRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> AttendanceResponse:
    row = await update_attendance(conn, user_id=user.id, session_id=UUID(sessionId), status=payload.status)
    return AttendanceResponse(userId=str(row["userId"]), sessionId=str(row["sessionId"]), status=row["status"])


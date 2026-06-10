from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import CurrentUser, conn_dep, get_current_user
from app.schemas import CircleMessageCreate, CircleMessageResponse
from app.services import circle_chat_service as chat_svc

router = APIRouter(prefix="/circles", tags=["circle-chat"])


@router.get("/{circle_id}/messages", response_model=list[CircleMessageResponse])
async def list_messages(
    circle_id: UUID,
    limit: int = Query(100, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
    conn=Depends(conn_dep),
) -> list[CircleMessageResponse]:
    rows = await chat_svc.list_messages(conn, circle_id, user.id, limit)
    return [CircleMessageResponse(**r) for r in rows]


@router.post("/{circle_id}/messages", response_model=CircleMessageResponse)
async def post_message(
    circle_id: UUID,
    payload: CircleMessageCreate,
    user: CurrentUser = Depends(get_current_user),
    conn=Depends(conn_dep),
) -> CircleMessageResponse:
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body cannot be empty")
    if len(body) > 4000:
        raise HTTPException(status_code=400, detail="Message body is too long")
    row = await chat_svc.create_message(conn, circle_id, user.id, body)
    return CircleMessageResponse(**row)

import asyncpg
from fastapi import APIRouter, Depends

from app.deps import CurrentUser, conn_dep, get_current_user
from app.services.home_query import fetch_home

from app.schemas import HomeResponse

router = APIRouter(tags=["home"])


@router.get("/home", response_model=HomeResponse)
async def get_home(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> HomeResponse:
    return await fetch_home(conn, user.id)


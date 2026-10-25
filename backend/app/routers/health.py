from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

DATABASE_CHECK_TIMEOUT_SECONDS = 3.0


@router.get("/health")
async def health(request: Request) -> JSONResponse:
    """Public liveness check. Runs SELECT 1 and reveals nothing about the database."""
    try:
        pool = request.app.state.db_pool
        async with pool.acquire(timeout=DATABASE_CHECK_TIMEOUT_SECONDS) as conn:
            await conn.fetchval("SELECT 1", timeout=DATABASE_CHECK_TIMEOUT_SECONDS)
    except Exception as exc:
        logger.warning("Health check database failure error_type=%s", type(exc).__name__)
        return JSONResponse(status_code=503, content={"status": "error", "database": "unavailable"})
    return JSONResponse(status_code=200, content={"status": "ok", "database": "ok"})

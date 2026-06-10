from __future__ import annotations

import logging
import os
from typing import Any, AsyncIterator

import asyncpg
from fastapi import Request
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def _database_url() -> str:
    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        url = "postgresql://postgres@localhost:5432/Circles"
    return url


def _pool_connect_kwargs(url: str) -> dict[str, Any]:
    """Supabase and most cloud Postgres require TLS."""
    kwargs: dict[str, Any] = {}
    ssl_env = os.getenv("DATABASE_SSL", "").strip().lower()
    if ssl_env in ("1", "true", "yes", "require") or "supabase.com" in url:
        kwargs["ssl"] = "require"
    return kwargs


async def create_pool() -> asyncpg.Pool:
    """Open pool with a short connect timeout so dev reload does not hang silently."""
    url = _database_url()
    connect_kwargs = _pool_connect_kwargs(url)
    logger.info("Connecting to database (timeout 12s)…")
    try:
        pool = await asyncpg.create_pool(
            dsn=url,
            min_size=1,
            max_size=10,
            timeout=12.0,
            command_timeout=45.0,
            **connect_kwargs,
        )
    except Exception as e:
        logger.error(
            "Database connection failed. Is PostgreSQL running? Check DATABASE_URL in backend/.env — %s",
            e,
        )
        raise
    logger.info("Database pool ready")
    return pool


async def close_pool(pool: asyncpg.Pool) -> None:
    await pool.close()


def get_pool(request: Request) -> asyncpg.Pool:
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        raise RuntimeError("DB pool not initialized")
    return pool


async def acquire_conn(request: Request) -> AsyncIterator[asyncpg.Connection]:
    pool = get_pool(request)
    async with pool.acquire() as conn:
        yield conn


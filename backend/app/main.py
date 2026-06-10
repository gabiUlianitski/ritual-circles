from pathlib import Path
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

from app.db import close_pool, create_pool

from app.routers.attendance import router as attendance_router
from app.routers.auth import router as auth_router
from app.routers.circle_chat import router as circle_chat_router
from app.routers.circles import router as circles_router
from app.routers.hobies import router as hobies_router
from app.routers.geo import router as geo_router
from app.routers.home import router as home_router
from app.routers.me import router as me_router
from app.routers.sessions import router as sessions_router

logger = logging.getLogger(__name__)

_ALLOWED_LOCAL_ORIGINS = frozenset({"http://localhost:5173", "http://127.0.0.1:5173"})


def _allowed_cors_origins() -> list[str]:
    origins = set(_ALLOWED_LOCAL_ORIGINS)
    for part in os.environ.get("ALLOWED_ORIGINS", "").split(","):
        origin = part.strip().rstrip("/")
        if origin:
            origins.add(origin)
    return sorted(origins)


def _cors_headers(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin") or ""
    if origin not in _allowed_cors_origins():
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    }


def _register_cors_exception_handlers(app: FastAPI) -> None:
    """
    Unhandled errors bypass CORSMiddleware's normal response path, so the browser
    reports a CORS failure even when the real issue is a 500. Attach the same
    allow-origin headers on error responses for local dev origins.
    """

    @app.exception_handler(StarletteHTTPException)
    async def cors_http_exception(request: Request, exc: StarletteHTTPException):
        response = await http_exception_handler(request, exc)
        for k, v in _cors_headers(request).items():
            response.headers[k] = v
        return response

    @app.exception_handler(RequestValidationError)
    async def cors_validation_exception(request: Request, exc: RequestValidationError):
        response = await request_validation_exception_handler(request, exc)
        for k, v in _cors_headers(request).items():
            response.headers[k] = v
        return response

    @app.exception_handler(Exception)
    async def cors_unhandled_exception(request: Request, exc: Exception):
        logger.exception("Unhandled exception during request")
        detail: str | dict = "Internal server error"
        if os.environ.get("RITUAL_DEBUG", "").strip().lower() in ("1", "true", "yes"):
            detail = repr(exc)
        elif "invite_only" in str(exc).lower() and "column" in str(exc).lower():
            detail = (
                "Database is missing expected columns (e.g. invite_only). "
                "Apply migrations under db/migrations/, including 006_circle_invite_only.sql."
            )
        elif "ritual_level" in str(exc).lower() and "integer" in str(exc).lower():
            detail = (
                "Database ritual_level column must be TEXT. "
                "Apply db/migrations/020_circle_ritual_level_text.sql."
            )
        elif "maxsize_check" in str(exc).lower() or (
            "maxsize" in str(exc).lower() and "check constraint" in str(exc).lower()
        ):
            detail = (
                "Database still has legacy maxSize = 6 only constraint. "
                "Run: python scripts/apply_migration_024.py"
            )
        content: dict = detail if isinstance(detail, dict) else {"detail": detail}
        response = JSONResponse(status_code=500, content=content)
        for k, v in _cors_headers(request).items():
            response.headers[k] = v
        return response


def create_app() -> FastAPI:
    app = FastAPI(title="Ritual Circles API", version="0.1.0")

    # Minimal CORS for local mobile-first web dev.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_cors_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

    _register_cors_exception_handlers(app)

    @app.on_event("startup")
    async def _startup() -> None:
        # Load backend/.env before DB pool + JWT usage (JWT_SECRET, DATABASE_URL).
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
        logger.info("Ritual Circles API starting…")
        app.state.db_pool = await create_pool()
        logger.info("Ritual Circles API ready")

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        pool = getattr(app.state, "db_pool", None)
        if pool is not None:
            await close_pool(pool)

    app.include_router(auth_router)
    app.include_router(geo_router)
    app.include_router(home_router)
    app.include_router(me_router)
    app.include_router(hobies_router)
    app.include_router(circles_router)
    app.include_router(circle_chat_router)
    app.include_router(sessions_router)
    app.include_router(attendance_router)

    return app


app = create_app()


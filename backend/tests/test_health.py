"""GET /health: public, read-only database check with a fixed, minimal response."""

from __future__ import annotations

import os
import unittest

import asyncpg
import httpx
from dotenv import load_dotenv

from app.main import create_app
from tests.test_activities import ROOT

HEALTHY = {"status": "ok", "database": "ok"}
UNAVAILABLE = {"status": "error", "database": "unavailable"}
BUSINESS_TABLES = (
    "users",
    "circles",
    "circle_members",
    "activities",
    "activity_participants",
    "activity_occurrences",
    "activity_occurrence_participants",
    "activity_notifications",
    "sessions",
    "attendance",
)
SECRET_CONNECTION_TEXT = "postgresql://health-user:health-password@db.internal.example:5432/secret_db"


class _BrokenPool:
    def acquire(self, timeout: float | None = None):
        raise OSError(f"could not connect to {SECRET_CONNECTION_TEXT}")


async def _get(app, path: str = "/health", headers: dict[str, str] | None = None) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path, headers=headers)


class HealthWithDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        load_dotenv(ROOT / "backend" / ".env")
        url = os.getenv("DATABASE_URL")
        if not url:
            self.skipTest("DATABASE_URL missing")
        try:
            self.pool = await asyncpg.create_pool(url, min_size=1, max_size=2)
        except Exception as exc:
            self.skipTest(f"database unavailable: {exc.__class__.__name__}")
        self.app = create_app()
        self.app.state.db_pool = self.pool
        self.url = url

    async def asyncTearDown(self) -> None:
        pool = getattr(self, "pool", None)
        if pool is not None:
            await pool.close()

    async def _row_counts(self) -> dict[str, int]:
        async with self.pool.acquire() as conn:
            return {t: int(await conn.fetchval(f"SELECT COUNT(*) FROM {t}")) for t in BUSINESS_TABLES}

    async def test_f_healthy_database_returns_ok(self) -> None:
        response = await _get(self.app)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), HEALTHY)

    async def test_h_no_authentication_is_needed(self) -> None:
        response = await _get(self.app)
        self.assertEqual(response.status_code, 200)
        bad_token = await _get(self.app, headers={"Authorization": "Bearer not-a-token"})
        self.assertEqual(bad_token.status_code, 200)

    async def test_i_health_changes_no_rows(self) -> None:
        before = await self._row_counts()
        for _ in range(3):
            self.assertEqual((await _get(self.app)).status_code, 200)
        self.assertEqual(await self._row_counts(), before)

    async def test_j_response_reveals_nothing_about_the_database(self) -> None:
        response = await _get(self.app)
        body = response.text.lower()
        self.assertEqual(set(response.json()), {"status", "database"})
        for leak in ("postgres", "select", "version", "localhost", "password", "jwt", "user"):
            self.assertNotIn(leak, body)
        self.assertNotIn(self.url.lower(), body)


class HealthWithoutDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_g_database_failure_returns_503_without_details(self) -> None:
        app = create_app()
        app.state.db_pool = _BrokenPool()
        with self.assertLogs("app.routers.health", level="WARNING") as logs:
            response = await _get(app)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), UNAVAILABLE)
        for part in ("health-password", "db.internal.example", "secret_db", "could not connect"):
            self.assertNotIn(part, response.text)
            self.assertNotIn(part, "\n".join(logs.output))

    async def test_g_missing_pool_returns_503(self) -> None:
        response = await _get(create_app())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), UNAVAILABLE)


if __name__ == "__main__":
    unittest.main()

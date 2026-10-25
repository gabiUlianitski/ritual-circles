from __future__ import annotations

import logging
import os
import unittest
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import httpx
from fastapi import Depends, FastAPI

from app.auth.jwt import create_token, decode_token
from app.deps import CurrentUser, conn_dep, get_current_user
from app.main import create_app
from app.routers.hobies import router as hobies_router
from app.security_config import SecurityConfigurationError, security_config


TEST_SECRET = "test-only-jwt-secret-with-32-characters"


class _FakeConn:
    def __init__(self, *, known_users: set[UUID] | None = None, hobby_in_use: bool = False):
        self.known_users = known_users or set()
        self.hobby_in_use = hobby_in_use

    async def fetchval(self, query: str, *args):
        if "SELECT EXISTS" in query:
            return bool(args and args[0] in self.known_users)
        if "COUNT(*)" in query:
            return 1 if self.hobby_in_use else 0
        return None

    async def fetchrow(self, query: str, *args):
        if "SELECT 1 FROM hobies" in query and self.hobby_in_use:
            return {"exists": 1}
        return None

    async def fetch(self, query: str, *args):
        return []

    async def execute(self, query: str, *args):
        if query.lstrip().upper().startswith("UPDATE"):
            return "UPDATE 0"
        return "DELETE 0"


def _environment(**overrides: str):
    values = {
        "ENVIRONMENT": "test",
        "JWT_SECRET": TEST_SECRET,
        "ALLOW_DEV_USER_HEADER": "false",
        "HOBBY_ADMIN_USER_IDS": "",
    }
    values.update(overrides)
    return patch.dict(os.environ, values, clear=False)


def _test_app(conn: _FakeConn) -> FastAPI:
    app = FastAPI()

    async def override_conn():
        yield conn

    app.dependency_overrides[conn_dep] = override_conn

    @app.get("/whoami")
    async def whoami(user: CurrentUser = Depends(get_current_user)):
        return {"id": str(user.id)}

    app.include_router(hobies_router)
    return app


class SecurityConfigurationTests(unittest.TestCase):
    def test_production_rejects_development_header(self) -> None:
        with _environment(ENVIRONMENT="production", ALLOW_DEV_USER_HEADER="true"):
            with self.assertRaises(SecurityConfigurationError):
                security_config()

    def test_production_requires_safe_secret(self) -> None:
        for secret in ("", "dev-secret-change-me"):
            with self.subTest(secret=bool(secret)):
                with _environment(ENVIRONMENT="production", JWT_SECRET=secret):
                    with self.assertRaises(SecurityConfigurationError):
                        security_config()

    def test_production_rejects_missing_secret(self) -> None:
        with _environment(ENVIRONMENT="production", JWT_SECRET="temporary"):
            os.environ.pop("JWT_SECRET", None)
            with self.assertRaises(SecurityConfigurationError):
                security_config()

    def test_valid_secret_issues_and_validates_token(self) -> None:
        user_id = uuid4()
        with _environment():
            self.assertEqual(decode_token(create_token(user_id)), user_id)

    def test_altered_token_is_rejected(self) -> None:
        with _environment():
            token = create_token(uuid4())
            altered = token[:-1] + ("a" if token[-1] != "a" else "b")
            with self.assertRaises(Exception):
                decode_token(altered)

    def test_startup_error_and_log_do_not_contain_secret(self) -> None:
        secret = "unsafe-visible-value"
        app = create_app()

        async def run_startup() -> tuple[str, str]:
            with self.assertLogs("app.main", level=logging.ERROR) as captured:
                with self.assertRaises(SecurityConfigurationError) as raised:
                    await app.router.on_startup[0]()
            return str(raised.exception), "\n".join(captured.output)

        with _environment(ENVIRONMENT="production", JWT_SECRET=secret):
            error, logs = __import__("asyncio").run(run_startup())
        self.assertNotIn(secret, error)
        self.assertNotIn(secret, logs)


class DevelopmentHeaderTests(unittest.IsolatedAsyncioTestCase):
    async def _get(
        self,
        conn: _FakeConn,
        *,
        headers: dict[str, str],
    ) -> httpx.Response:
        transport = httpx.ASGITransport(app=_test_app(conn))
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/whoami", headers=headers)

    async def test_disabled_header_cannot_authenticate(self) -> None:
        with _environment():
            response = await self._get(
                _FakeConn(known_users={uuid4()}),
                headers={"X-User-Id": str(uuid4())},
            )
        self.assertEqual(response.status_code, 401)

    async def test_explicit_test_flag_authenticates_known_user(self) -> None:
        user_id = uuid4()
        with _environment(ALLOW_DEV_USER_HEADER="true"):
            response = await self._get(
                _FakeConn(known_users={user_id}),
                headers={"X-User-Id": str(user_id)},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], str(user_id))

    async def test_malformed_and_unknown_headers_are_rejected(self) -> None:
        with _environment(ALLOW_DEV_USER_HEADER="true"):
            malformed = await self._get(_FakeConn(), headers={"X-User-Id": "not-a-uuid"})
            unknown = await self._get(_FakeConn(), headers={"X-User-Id": str(uuid4())})
        self.assertEqual(malformed.status_code, 401)
        self.assertEqual(unknown.status_code, 401)

    async def test_valid_jwt_wins_over_different_header(self) -> None:
        jwt_user = uuid4()
        header_user = uuid4()
        with _environment(ALLOW_DEV_USER_HEADER="true"):
            response = await self._get(
                _FakeConn(known_users={header_user}),
                headers={
                    "Authorization": f"Bearer {create_token(jwt_user)}",
                    "X-User-Id": str(header_user),
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], str(jwt_user))

    async def test_production_ignores_header_when_flag_is_false(self) -> None:
        with _environment(ENVIRONMENT="production", JWT_SECRET="p" * 40):
            response = await self._get(
                _FakeConn(known_users={uuid4()}),
                headers={"X-User-Id": str(uuid4())},
            )
        self.assertEqual(response.status_code, 401)


class HobbyAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    ROUTES = (
        ("POST", "/hobies/spell-suggest", {"displayName": "Tennis"}),
        ("POST", "/hobies/precheck", {"displayName": "Tennis"}),
        ("POST", "/hobies", {"displayName": " "}),
        ("POST", "/hobies/bulk", {"action": "archive", "slugs": []}),
        ("PATCH", "/hobies/missing", {}),
        ("POST", "/hobies/missing/archive", None),
        ("POST", "/hobies/missing/restore", None),
        ("DELETE", "/hobies/missing", None),
        ("POST", "/hobies/missing/regenerate", {"fields": ["description"]}),
    )

    async def _request(
        self,
        method: str,
        path: str,
        body: object,
        *,
        token: str | None,
        conn: _FakeConn | None = None,
    ) -> httpx.Response:
        transport = httpx.ASGITransport(app=_test_app(conn or _FakeConn()))
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, json=body, headers=headers)

    async def test_every_non_get_route_rejects_anonymous_and_non_admin(self) -> None:
        user_id = uuid4()
        with _environment():
            token = create_token(user_id)
            for method, path, body in self.ROUTES:
                with self.subTest(method=method, path=path, role="anonymous"):
                    response = await self._request(method, path, body, token=None)
                    self.assertEqual(response.status_code, 401)
                with self.subTest(method=method, path=path, role="member"):
                    response = await self._request(method, path, body, token=token)
                    self.assertEqual(response.status_code, 403)

    async def test_admin_reaches_existing_business_validation(self) -> None:
        admin_id = uuid4()
        with _environment(HOBBY_ADMIN_USER_IDS=str(admin_id)):
            token = create_token(admin_id)
            expected = {
                "/hobies/spell-suggest": 200,
                "/hobies/precheck": 200,
                "/hobies": 400,
                "/hobies/bulk": 200,
                "/hobies/missing": 404,
                "/hobies/missing/archive": 404,
                "/hobies/missing/restore": 404,
                "/hobies/missing/regenerate": 404,
            }
            for method, path, body in self.ROUTES:
                if path in {"/hobies/spell-suggest", "/hobies/precheck"}:
                    continue
                with self.subTest(method=method, path=path):
                    response = await self._request(method, path, body, token=token)
                    self.assertEqual(response.status_code, expected[path])

    async def test_delete_in_use_keeps_conflict_protection(self) -> None:
        admin_id = uuid4()
        with _environment(HOBBY_ADMIN_USER_IDS=str(admin_id)):
            response = await self._request(
                "DELETE",
                "/hobies/used",
                None,
                token=create_token(admin_id),
                conn=_FakeConn(hobby_in_use=True),
            )
        self.assertEqual(response.status_code, 409)

    async def test_unauthorized_regenerate_never_calls_provider(self) -> None:
        with _environment():
            with patch("app.routers.hobies.enrich_hoby", new_callable=AsyncMock) as provider:
                response = await self._request(
                    "POST",
                    "/hobies/tennis/regenerate",
                    {"fields": ["description"]},
                    token=None,
                )
        self.assertEqual(response.status_code, 401)
        provider.assert_not_awaited()

    async def test_get_list_remains_public_and_empty_admin_list_denies(self) -> None:
        user_id = uuid4()
        with _environment(HOBBY_ADMIN_USER_IDS=""):
            listing = await self._request("GET", "/hobies", None, token=None)
            denied = await self._request(
                "POST",
                "/hobies/bulk",
                {"action": "archive", "slugs": []},
                token=create_token(user_id),
            )
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(denied.status_code, 403)

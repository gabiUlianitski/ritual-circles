"""Release tooling: migration runner, read-only schema check, config check, deploy script."""

from __future__ import annotations

import contextlib
import io
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import asyncpg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "backend" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import apply_production_migrations as runner  # noqa: E402
import check_production_schema as schema_check  # noqa: E402
import check_release_config as config_check  # noqa: E402

REMOTE_URL = "postgresql://release-user:release-password@db.remote.example:5432/postgres"
GOOD_SECRET = "s" * 40
GOOD_ADMIN = "11111111-1111-1111-1111-111111111111"


class _RecordingConn:
    def __init__(self, fail_on: int | None = None) -> None:
        self.fail_on = fail_on
        self.executed: list[str] = []

    async def execute(self, stmt: str) -> None:
        self.executed.append(stmt)
        if self.fail_on is not None and len(self.executed) == self.fail_on:
            raise asyncpg.exceptions.UndefinedTableError('relation "circles" does not exist')

    async def close(self) -> None:
        return None


class MigrationRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def _run(self, names: list[str], conn: _RecordingConn) -> tuple[int, str]:
        async def fake_connect(url: str, **kwargs: object) -> _RecordingConn:
            return conn

        out = io.StringIO()
        with (
            patch.object(sys, "argv", ["apply_production_migrations.py", *names]),
            patch.object(runner, "target_url", return_value=REMOTE_URL),
            patch.object(runner.asyncpg, "connect", fake_connect),
            contextlib.redirect_stdout(out),
        ):
            code = await runner.main()
        return code, out.getvalue()

    def test_statements_skip_comments_and_split_on_semicolons(self) -> None:
        parts = runner.statements("-- note\nCREATE TABLE a (id INT);\n\nALTER TABLE a\n  ADD COLUMN b INT;\n")
        self.assertEqual(parts, ["CREATE TABLE a (id INT);", "ALTER TABLE a\n  ADD COLUMN b INT;"])

    def test_pending_list_is_ordered_and_every_file_exists(self) -> None:
        self.assertEqual(runner.PENDING, sorted(runner.PENDING))
        self.assertEqual(runner.PENDING[0][:3], "031")
        self.assertEqual(runner.PENDING[-1][:3], "046")
        for name in runner.PENDING:
            self.assertTrue((runner.MIGRATIONS / name).is_file(), name)
            self.assertNotIn("$$", (runner.MIGRATIONS / name).read_text(encoding="utf-8"), name)

    async def test_success_prints_each_file_and_a_summary(self) -> None:
        conn = _RecordingConn()
        code, out = await self._run(["031_circle_description.sql", "032_user_avatar_url.sql"], conn)
        self.assertEqual(code, 0)
        self.assertIn("==> 031_circle_description.sql", out)
        self.assertIn("Completed 2 of 2 files", out)
        self.assertNotIn("release-password", out)
        self.assertNotIn("db.remote.example", out)

    async def test_first_failure_stops_and_names_file_and_statement(self) -> None:
        first = runner.statements((runner.MIGRATIONS / "038_circle_members.sql").read_text(encoding="utf-8"))
        conn = _RecordingConn(fail_on=len(first) + 2)
        code, out = await self._run(
            ["038_circle_members.sql", "039_activities.sql", "040_activity_participants.sql"], conn
        )
        self.assertEqual(code, 1)
        self.assertIn("FAILED 039_activities.sql at statement 2 of", out)
        self.assertIn("SQLSTATE 42P01", out)
        self.assertIn("ok      038_circle_members.sql", out)
        self.assertIn("not run 040_activity_participants.sql", out)
        self.assertIn("no per-file transaction", out)
        self.assertEqual(len(conn.executed), len(first) + 2)
        self.assertNotIn("release-password", out)

    async def test_missing_file_fails_before_connecting(self) -> None:
        with patch.object(runner, "target_url", side_effect=AssertionError("must not connect")):
            with patch.object(sys, "argv", ["x", "999_missing.sql"]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(await runner.main(), 1)

    def test_localhost_is_refused_without_opt_in(self) -> None:
        env = {"DATABASE_URL": "postgresql://u@localhost:5432/db"}
        with patch.dict(os.environ, env), patch.object(runner, "load_dotenv"):
            with self.assertRaises(SystemExit) as caught:
                runner.target_url(allow_local=False)
        self.assertIn("Refusing localhost", str(caught.exception))
        self.assertNotIn("postgresql://", str(caught.exception))


class _EmptyCatalogConn:
    async def fetch(self, query: str, *args: object) -> list:
        return []


class SchemaCheckTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_database_reports_every_missing_table(self) -> None:
        problems = await schema_check.run_checks(_EmptyCatalogConn())
        for table in schema_check.REQUIRED_COLUMNS:
            self.assertIn(f"missing table {table}", problems)
        self.assertIn("missing unique index activity_occurrences_activity_slot", problems)

    def test_schema_check_source_is_read_only(self) -> None:
        source = (SCRIPTS / "check_production_schema.py").read_text(encoding="utf-8")
        self.assertIn("READ ONLY", source)
        code = re.sub(r'"""[\s\S]*?"""', "", source)
        for verb in ("INSERT ", "UPDATE ", "DELETE ", "ALTER ", "CREATE ", "DROP ", "TRUNCATE "):
            self.assertNotIn(verb, code)

    async def test_migrated_local_database_passes_in_a_read_only_session(self) -> None:
        load_dotenv(ROOT / "backend" / ".env")
        url = os.getenv("DATABASE_URL")
        if not url:
            self.skipTest("DATABASE_URL missing")
        try:
            conn = await asyncpg.connect(url)
        except Exception as exc:
            self.skipTest(f"database unavailable: {exc.__class__.__name__}")
        try:
            await conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
            self.assertEqual(await schema_check.run_checks(conn), [])
            with self.assertRaises(asyncpg.exceptions.ReadOnlySQLTransactionError):
                await conn.execute("CREATE TEMP TABLE release_check_probe (id INT)")
        finally:
            await conn.close()


def _good_env(**overrides: str) -> dict[str, str]:
    env = {
        "ENVIRONMENT": "production",
        "JWT_SECRET": GOOD_SECRET,
        "ALLOW_DEV_USER_HEADER": "false",
        "HOBBY_ADMIN_USER_IDS": GOOD_ADMIN,
        "DATABASE_URL": REMOTE_URL,
        "DATABASE_SSL": "require",
        "ALLOWED_ORIGINS": "https://ritual-circles.vercel.app",
    }
    env.update(overrides)
    return env


class ReleaseConfigTests(unittest.TestCase):
    def _status(self, env: dict[str, str], name: str) -> str:
        return config_check.check(env)[name][0]

    def test_complete_production_config_is_configured(self) -> None:
        results = config_check.check(_good_env())
        self.assertEqual({status for status, _ in results.values()}, {"configured"})

    def test_empty_environment_is_missing_except_disabled_dev_header(self) -> None:
        results = config_check.check({})
        self.assertEqual(results["ALLOW_DEV_USER_HEADER"][0], "configured")
        for name in set(config_check.NAMES) - {"ALLOW_DEV_USER_HEADER"}:
            self.assertEqual(results[name][0], "missing", name)

    def test_unsafe_values_are_flagged(self) -> None:
        self.assertEqual(self._status(_good_env(ENVIRONMENT="development"), "ENVIRONMENT"), "unsafe")
        self.assertEqual(self._status(_good_env(JWT_SECRET="dev-secret-change-me"), "JWT_SECRET"), "unsafe")
        self.assertEqual(self._status(_good_env(JWT_SECRET="short"), "JWT_SECRET"), "unsafe")
        self.assertEqual(self._status(_good_env(ALLOW_DEV_USER_HEADER="true"), "ALLOW_DEV_USER_HEADER"), "unsafe")
        self.assertEqual(self._status(_good_env(HOBBY_ADMIN_USER_IDS="admin@x"), "HOBBY_ADMIN_USER_IDS"), "unsafe")
        self.assertEqual(
            self._status(_good_env(DATABASE_URL="postgresql://u@localhost/db"), "DATABASE_URL"), "unsafe"
        )
        self.assertEqual(self._status(_good_env(DATABASE_SSL="disable"), "DATABASE_SSL"), "unsafe")
        self.assertEqual(self._status(_good_env(ALLOWED_ORIGINS="*"), "ALLOWED_ORIGINS"), "unsafe")
        self.assertEqual(
            self._status(_good_env(ALLOWED_ORIGINS="http://app.example"), "ALLOWED_ORIGINS"), "unsafe"
        )

    def test_output_never_contains_values(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "production.env"
            path.write_text("\n".join(f"{k}={v}" for k, v in _good_env().items()), encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = config_check.main(["--env-file", str(path)])
        self.assertEqual(code, 0)
        text = out.getvalue()
        for secret in (GOOD_SECRET, "release-password", "db.remote.example", GOOD_ADMIN, "vercel.app"):
            self.assertNotIn(secret, text)

    def test_default_source_is_the_process_environment_not_backend_env(self) -> None:
        with patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(io.StringIO()) as out:
            code = config_check.main([])
        self.assertEqual(code, 1)
        self.assertIn("current process environment", out.getvalue())


class LocaleParityTests(unittest.TestCase):
    PLURAL = re.compile(r"_(zero|one|two|few|many|other)$")

    def _keys(self, name: str) -> set[str]:
        data = json.loads((ROOT / "web" / "src" / "locales" / name).read_text(encoding="utf-8"))

        def walk(node: dict, prefix: str = ""):
            for key, value in node.items():
                path = f"{prefix}.{key}" if prefix else key
                if isinstance(value, dict):
                    yield from walk(value, path)
                else:
                    yield path

        return set(walk(data))

    def test_english_and_hebrew_have_the_same_keys_modulo_plural_forms(self) -> None:
        en = self._keys("en.json")
        he = self._keys("he.json")
        base = lambda keys: {self.PLURAL.sub("", k) for k in keys}  # noqa: E731
        self.assertEqual(base(en) - base(he), set())
        self.assertEqual(base(he) - base(en), set())
        for key in en:
            if key.endswith("_other"):
                self.assertIn(key, he)


class ReleasePackagingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.deploy = (ROOT / "scripts" / "deploy-production.ps1").read_text(encoding="utf-8")

    def test_migrate_runs_before_push_and_push_rechecks_schema(self) -> None:
        migrate = self.deploy.index("if ($Migrate) {")
        push = self.deploy.index("if ($Push) {")
        commit = self.deploy.index("if ($Commit) {")
        self.assertLess(commit, migrate)
        self.assertLess(migrate, push)
        self.assertIn("Invoke-SchemaCheck", self.deploy[push:])

    def test_include_list_covers_release_paths(self) -> None:
        for path in (
            '"backend/app"',
            '"backend/tests"',
            '"web/src"',
            '"backend/scripts/check_production_schema.py"',
            '"backend/scripts/check_release_config.py"',
            '"render.yaml"',
            '"DEPLOYMENT.md"',
            '".gitignore"',
        ):
            self.assertIn(path, self.deploy)
        for number in range(31, 47):
            self.assertTrue(any(name.startswith(f"{number:03d}_") for name in runner.PENDING))
            self.assertIn(f'"{number:03d}_', self.deploy)

    def test_include_list_excludes_local_and_legacy_artifacts(self) -> None:
        include = self.deploy[self.deploy.index("$include = @(") : self.deploy.index("$forbidden")]
        for path in ("seed_demo_data", "backups", "web.zip", "reset_account", "h origin main", "dist", ".env\""):
            self.assertNotIn(path, include)

    def test_shipped_legacy_diagnostics_refuse_to_run_by_default(self) -> None:
        for name in ("test_create_circle.py", "repro_create_http.py", "diag_supabase_create.py"):
            self.assertIn(f'"backend/scripts/{name}"', self.deploy)
            self.assertIn("ALLOW_LEGACY_SCRIPT", (SCRIPTS / name).read_text(encoding="utf-8"), name)

    def test_render_health_check_uses_the_database_aware_endpoint(self) -> None:
        self.assertIn("healthCheckPath: /health", (ROOT / "render.yaml").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

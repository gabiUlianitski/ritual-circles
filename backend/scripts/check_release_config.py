"""Check production configuration names without printing any value.

Reads the current process environment, or a file passed with --env-file
(parsed only; it is not loaded into the environment). backend/.env is NOT
read by default, because it holds development settings.

  cd backend
  .\\.venv\\Scripts\\python.exe scripts\\check_release_config.py --env-file C:\\path\\to\\production.env

Each name is reported as configured, missing, or unsafe. Exit status 0 only
when every name is configured.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Mapping
from uuid import UUID

from dotenv import dotenv_values

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.security_config import (  # noqa: E402
    PRODUCTION_ENVIRONMENTS,
    TRUE_VALUES,
    SecurityConfig,
    SecurityConfigurationError,
    validate_security_config,
)

CONFIGURED = "configured"
MISSING = "missing"
UNSAFE = "unsafe"
NAMES = (
    "ENVIRONMENT",
    "JWT_SECRET",
    "ALLOW_DEV_USER_HEADER",
    "HOBBY_ADMIN_USER_IDS",
    "DATABASE_URL",
    "DATABASE_SSL",
    "ALLOWED_ORIGINS",
)
SSL_REQUIRED_VALUES = {"1", "true", "yes", "require"}
LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def _value(env: Mapping[str, str | None], name: str) -> str:
    return (env.get(name) or "").strip()


def _jwt_secret(env: Mapping[str, str | None]) -> tuple[str, str]:
    secret = _value(env, "JWT_SECRET")
    if not secret:
        return MISSING, "not set"
    try:
        validate_security_config(
            SecurityConfig(
                environment="production",
                jwt_secret=secret,
                allow_dev_user_header=False,
                hobby_admin_user_ids=frozenset(),
            )
        )
    except SecurityConfigurationError:
        return UNSAFE, "fails the production startup check (default value or shorter than 32 characters)"
    return CONFIGURED, "passes the production startup check"


def _admin_ids(env: Mapping[str, str | None]) -> tuple[str, str]:
    raw = [part.strip() for part in _value(env, "HOBBY_ADMIN_USER_IDS").split(",") if part.strip()]
    if not raw:
        return MISSING, "empty: nobody can manage the Hobby catalog"
    try:
        count = len({UUID(part) for part in raw})
    except ValueError:
        return UNSAFE, "contains an entry that is not a user ID; startup will fail"
    return CONFIGURED, f"{count} administrator ID(s)"


def _database_url(env: Mapping[str, str | None]) -> tuple[str, str]:
    url = _value(env, "DATABASE_URL")
    if not url:
        return MISSING, "not set"
    host = url.split("@")[-1].split("/")[0].split(":")[0].lower()
    if host in LOCAL_HOSTS:
        return UNSAFE, "points at a local database"
    return CONFIGURED, "set (value not shown)"


def _allowed_origins(env: Mapping[str, str | None]) -> tuple[str, str]:
    origins = [part.strip() for part in _value(env, "ALLOWED_ORIGINS").split(",") if part.strip()]
    if not origins:
        return MISSING, "not set: only local dev origins would be allowed"
    if any(origin == "*" or not origin.startswith("https://") for origin in origins):
        return UNSAFE, "contains '*' or a non-https origin"
    return CONFIGURED, f"{len(origins)} https origin(s)"


def check(env: Mapping[str, str | None]) -> dict[str, tuple[str, str]]:
    results: dict[str, tuple[str, str]] = {}

    environment = _value(env, "ENVIRONMENT").lower()
    if not environment:
        results["ENVIRONMENT"] = (MISSING, "not set: production-only checks would not run")
    elif environment in PRODUCTION_ENVIRONMENTS:
        results["ENVIRONMENT"] = (CONFIGURED, "production")
    else:
        results["ENVIRONMENT"] = (UNSAFE, "not a production value")

    results["JWT_SECRET"] = _jwt_secret(env)

    if _value(env, "ALLOW_DEV_USER_HEADER").lower() in TRUE_VALUES:
        results["ALLOW_DEV_USER_HEADER"] = (UNSAFE, "enabled: startup will refuse in production")
    else:
        results["ALLOW_DEV_USER_HEADER"] = (CONFIGURED, "disabled or unset")

    results["HOBBY_ADMIN_USER_IDS"] = _admin_ids(env)
    results["DATABASE_URL"] = _database_url(env)

    ssl = _value(env, "DATABASE_SSL").lower()
    if not ssl:
        results["DATABASE_SSL"] = (MISSING, "not set")
    elif ssl in SSL_REQUIRED_VALUES:
        results["DATABASE_SSL"] = (CONFIGURED, "TLS required")
    else:
        results["DATABASE_SSL"] = (UNSAFE, "does not require TLS")

    results["ALLOWED_ORIGINS"] = _allowed_origins(env)
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", type=Path, help="file with production NAME=value lines (parsed, not loaded)")
    args = parser.parse_args(argv)

    if args.env_file is not None:
        if not args.env_file.is_file():
            print("The --env-file path does not exist.")
            return 1
        env: Mapping[str, str | None] = dotenv_values(args.env_file)
        source = "the given env file"
    else:
        env = os.environ
        source = "the current process environment"

    results = check(env)
    print(f"Production configuration check ({source}); values are never shown:")
    for name in NAMES:
        status, note = results[name]
        print(f"  {name:<22} {status:<10} {note}")
    return 0 if all(status == CONFIGURED for status, _ in results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())

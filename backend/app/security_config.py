from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import UUID


TRUE_VALUES = frozenset({"1", "true", "yes"})
PRODUCTION_ENVIRONMENTS = frozenset({"prod", "production"})
UNSAFE_JWT_SECRETS = frozenset({"dev-secret-change-me"})


class SecurityConfigurationError(RuntimeError):
    """Raised before serving requests when authentication configuration is unsafe."""


@dataclass(frozen=True)
class SecurityConfig:
    environment: str
    jwt_secret: str
    allow_dev_user_header: bool
    hobby_admin_user_ids: frozenset[UUID]

    @property
    def is_production(self) -> bool:
        return self.environment in PRODUCTION_ENVIRONMENTS


def _enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in TRUE_VALUES


def _admin_user_ids() -> frozenset[UUID]:
    values: set[UUID] = set()
    for raw in os.getenv("HOBBY_ADMIN_USER_IDS", "").split(","):
        value = raw.strip()
        if not value:
            continue
        try:
            values.add(UUID(value))
        except ValueError as exc:
            raise SecurityConfigurationError(
                "HOBBY_ADMIN_USER_IDS contains an invalid user ID"
            ) from exc
    return frozenset(values)


def _read_security_config() -> SecurityConfig:
    return SecurityConfig(
        environment=os.getenv("ENVIRONMENT", "development").strip().lower() or "development",
        jwt_secret=os.getenv("JWT_SECRET", "").strip(),
        allow_dev_user_header=_enabled("ALLOW_DEV_USER_HEADER"),
        hobby_admin_user_ids=_admin_user_ids(),
    )


def security_config() -> SecurityConfig:
    return validate_security_config(_read_security_config())


def validate_security_config(config: SecurityConfig | None = None) -> SecurityConfig:
    config = config or _read_security_config()
    if not config.jwt_secret or config.jwt_secret in UNSAFE_JWT_SECRETS:
        raise SecurityConfigurationError("JWT_SECRET is missing or unsafe")
    if config.is_production and len(config.jwt_secret) < 32:
        raise SecurityConfigurationError("JWT_SECRET is too short for production")
    if config.is_production and config.allow_dev_user_header:
        raise SecurityConfigurationError(
            "ALLOW_DEV_USER_HEADER cannot be enabled in production"
        )
    return config


def is_hobby_admin(user_id: UUID) -> bool:
    return user_id in security_config().hobby_admin_user_ids

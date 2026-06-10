from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class AIConfig:
    enabled: bool
    provider: str
    api_key: str | None
    model: str
    api_url: str
    temperature: float
    max_tokens: int
    timeout_ms: int
    # When False, TLS cert verification is skipped (needed on some corporate networks only).
    verify_ssl: bool


def _coerce_enabled(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return raw != 0
    if isinstance(raw, str):
        return raw.strip().lower() in ("1", "true", "yes", "on")
    return False


def _verify_ssl_setting(data: dict[str, Any]) -> bool:
    v = data.get("HTTPX_VERIFY")
    if v is not None:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() not in ("0", "false", "no", "off")
        return bool(v)
    ev = os.getenv("HTTPX_VERIFY", "").strip().lower()
    if ev in ("0", "false", "no", "off"):
        return False
    return True


def _load_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_ai_config() -> AIConfig:
    # Load from backend/config/ai_keys.json (local, ignored by git)
    # or environment variables.
    base = Path(__file__).resolve().parents[2]  # backend/app/ai -> backend
    cfg_path = base / "config" / "ai_keys.json"
    data = _load_json_file(cfg_path)

    enabled = _coerce_enabled(data.get("AI_ENABLED", False)) or os.getenv("AI_ENABLED", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    verify_ssl = _verify_ssl_setting(data)
    provider = str(data.get("AI_PROVIDER", os.getenv("AI_PROVIDER", "groq"))).lower()

    if provider in ("google", "gemini", "anthropic", "azure"):
        # Not implemented in this minimal version.
        return AIConfig(False, provider, None, "", "", 0.0, 0, 0, verify_ssl)

    if provider == "openai":
        api_key = str(data.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY") or "")
        model = str(data.get("OPENAI_MODEL", os.getenv("OPENAI_MODEL", "gpt-4o-mini")))
        api_url = str(data.get("OPENAI_API_URL", os.getenv("OPENAI_API_URL", "https://api.openai.com/v1/chat/completions")))
    else:
        # default: groq (OpenAI-compatible endpoint)
        provider = "groq"
        api_key = str(data.get("GROQ_API_KEY") or os.getenv("GROQ_API_KEY") or "")
        model = str(data.get("GROQ_MODEL", os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")))
        api_url = str(data.get("GROQ_API_URL", os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions")))

    temperature = float(data.get("TEMPERATURE", os.getenv("TEMPERATURE", "0.2")))
    max_tokens = int(data.get("MAX_TOKENS", os.getenv("MAX_TOKENS", "1200")))
    timeout_ms = int(data.get("TIMEOUT", os.getenv("TIMEOUT", "60000")))

    if not enabled or not api_key:
        return AIConfig(False, provider, None, model, api_url, temperature, max_tokens, timeout_ms, verify_ssl)

    return AIConfig(True, provider, api_key, model, api_url, temperature, max_tokens, timeout_ms, verify_ssl)


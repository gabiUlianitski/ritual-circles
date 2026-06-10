from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.ai.config import AIConfig, load_ai_config

logger = logging.getLogger(__name__)


class AIClient:
    def __init__(self, cfg: AIConfig | None = None):
        self.cfg = cfg or load_ai_config()

    @property
    def enabled(self) -> bool:
        return bool(self.cfg.enabled)

    async def chat_json(self, *, system: str, user: str) -> dict[str, Any]:
        """
        OpenAI-compatible chat completion call (Groq/OpenAI).
        Returns parsed JSON object from the model.
        """
        if not self.enabled:
            raise RuntimeError("AI disabled")

        headers = {"Authorization": f"Bearer {self.cfg.api_key}"}
        base_payload = {
            "model": self.cfg.model,
            "temperature": self.cfg.temperature,
            "max_tokens": self.cfg.max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }

        timeout = httpx.Timeout(self.cfg.timeout_ms / 1000)
        if not self.cfg.verify_ssl:
            logger.warning(
                "ai_http_verify_disabled",
                extra={"provider": self.cfg.provider, "hint": "TLS verification off; use only if behind SSL inspection"},
            )
        async with httpx.AsyncClient(
            timeout=timeout,
            verify=self.cfg.verify_ssl,
            trust_env=True,
        ) as client:
            # Try strict JSON mode first (some providers support response_format).
            payload = dict(base_payload)
            payload["response_format"] = {"type": "json_object"}
            r = await client.post(self.cfg.api_url, headers=headers, json=payload)
            if r.status_code >= 400:
                # Fallback: remove response_format and rely on prompt discipline.
                logger.warning(
                    "ai_response_format_failed",
                    extra={
                        "status": r.status_code,
                        "provider": self.cfg.provider,
                        "body": (r.text or "")[:500],
                    },
                )
                r = await client.post(self.cfg.api_url, headers=headers, json=base_payload)
                if r.status_code >= 400:
                    logger.warning(
                        "ai_request_failed",
                        extra={
                            "status": r.status_code,
                            "provider": self.cfg.provider,
                            "body": (r.text or "")[:500],
                        },
                    )
            r.raise_for_status()
            data = r.json()

        content = data["choices"][0]["message"]["content"]
        if isinstance(content, str):
            # Some providers return JSON string; others wrap in text. Try strict parse first.
            try:
                return json.loads(content)
            except Exception:
                # Best-effort extraction of first JSON object in the text.
                start = content.find("{")
                end = content.rfind("}")
                if start != -1 and end != -1 and end > start:
                    return json.loads(content[start : end + 1])
                raise
        raise ValueError("Unexpected AI response")


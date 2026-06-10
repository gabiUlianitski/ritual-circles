from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel

MAX_USER_LANGUAGES = 15


class UserLanguage(BaseModel):
    code: str
    name: str
    preferred: bool = False


def normalize_user_languages(items: list[UserLanguage]) -> list[dict[str, str | bool]]:
    seen: set[str] = set()
    out: list[dict[str, str | bool]] = []
    preferred_idx: int | None = None
    for item in items:
        code = item.code.strip().lower()
        name = item.name.strip()
        if not code or not name or code in seen:
            continue
        seen.add(code)
        is_pref = bool(item.preferred)
        if is_pref and preferred_idx is not None:
            is_pref = False
        row: dict[str, str | bool] = {"code": code, "name": name, "preferred": is_pref}
        if is_pref:
            preferred_idx = len(out)
        out.append(row)
        if len(out) >= MAX_USER_LANGUAGES:
            break
    if out and preferred_idx is None:
        out[0]["preferred"] = True
    return out


def user_languages_from_row(row: Any) -> list[UserLanguage]:
    raw = row.get("languages_json") if hasattr(row, "get") else None
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    out: list[UserLanguage] = []
    for x in raw:
        if not isinstance(x, dict):
            continue
        code = str(x.get("code", "")).strip()
        name = str(x.get("name", "")).strip()
        if code and name:
            out.append(
                UserLanguage(
                    code=code,
                    name=name,
                    preferred=bool(x.get("preferred")),
                )
            )
    if out and not any(l.preferred for l in out):
        out[0] = out[0].model_copy(update={"preferred": True})
    return out

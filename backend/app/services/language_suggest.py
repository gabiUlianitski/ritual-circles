from __future__ import annotations

import pycountry


def language_suggest(*, query: str, limit: int = 12) -> list[dict[str, str]]:
    q = query.strip().casefold()
    if len(q) < 1:
        return []

    hits: list[tuple[int, str, str]] = []
    for lang in pycountry.languages:
        name = getattr(lang, "name", None)
        if not name:
            continue
        name_s = str(name)
        name_cf = name_s.casefold()
        if q not in name_cf:
            continue
        alpha_2 = getattr(lang, "alpha_2", None)
        code = alpha_2 or getattr(lang, "alpha_3", None)
        if not code:
            continue
        code_s = str(code).lower()
        if name_cf.startswith(q):
            rank = 0
        elif any(part.startswith(q) for part in name_cf.replace("-", " ").split()):
            rank = 1
        else:
            rank = 2
        has_alpha_2 = 0 if alpha_2 else 1
        hits.append((rank, has_alpha_2, len(name_s), name_s.lower(), code_s, name_s))

    hits.sort(key=lambda x: (x[0], x[1], x[2], x[3]))
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for _, _, _, _, code, name in hits:
        if code in seen:
            continue
        seen.add(code)
        out.append({"code": code, "name": name})
        if len(out) >= limit:
            break
    return out

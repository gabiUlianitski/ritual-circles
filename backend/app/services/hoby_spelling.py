from __future__ import annotations

import difflib
import re
import asyncpg

from app.services.hoby_enrichment import derive_hoby_slug


def _uniq(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in seq:
        k = x.lower()
        if k not in seen:
            seen.add(k)
            out.append(x)
    return out


def _suggest_slug(user_slug: str, known_slugs: list[str]) -> list[str]:
    u = user_slug.strip().lower()
    if not u or " " in u:
        return []

    out: list[str] = []
    for m in difflib.get_close_matches(u, known_slugs, n=8, cutoff=0.45):
        if m != u:
            out.append(m)

    try:
        from spellchecker import SpellChecker

        sc = SpellChecker()

        if "_" in u:
            parts = u.split("_")
            rebuilt: list[str] = []
            changed = False
            for p in parts:
                if not p.isalpha():
                    rebuilt.append(p)
                    continue
                if list(sc.unknown([p])):
                    c = sc.correction(p) or p
                    if c != p:
                        changed = True
                    rebuilt.append(c)
                else:
                    rebuilt.append(p)
            cand = "_".join(rebuilt)
            if changed and cand != u:
                out.insert(0, cand)

        alpha = u.replace("_", "")
        if alpha.isalpha() and alpha not in known_slugs and list(sc.unknown([alpha])):
            c = sc.correction(alpha)
            if c and c != alpha and difflib.SequenceMatcher(None, u, c).ratio() >= 0.72:
                if "_" not in u:
                    out.insert(0, c.lower())
    except ImportError:
        pass

    return _uniq([x for x in out if x and x != u])[:8]


def _suggest_display_name(text: str, known_names: list[str]) -> list[str]:
    t = text.strip()
    if not t:
        return []

    keys = [n.lower() for n in known_names]
    value_by_lower = {n.lower(): n for n in known_names}
    out: list[str] = []

    lc = t.lower()
    for m in difflib.get_close_matches(lc, keys, n=6, cutoff=0.72):
        if m != lc:
            out.append(value_by_lower[m])

    try:
        from spellchecker import SpellChecker

        sc = SpellChecker()

        def fix_token(tok: str) -> str:
            if not tok.isalpha():
                return tok
            lw = tok.lower()
            if not list(sc.unknown([lw])):
                return tok
            corr = sc.correction(lw) or lw
            if corr == lw:
                return tok
            if tok.isupper():
                return corr.upper()
            if tok[0].isupper():
                return corr[:1].upper() + corr[1:] if len(corr) > 1 else corr.upper()
            return corr

        pieces = re.split(r"([A-Za-z]+)", t)
        rebuilt: list[str] = []
        changed = False
        for p in pieces:
            if re.fullmatch(r"[A-Za-z]+", p):
                nxt = fix_token(p)
                if nxt != p:
                    changed = True
                rebuilt.append(nxt)
            else:
                rebuilt.append(p)
        if changed:
            suggestion = "".join(rebuilt)
            if suggestion.lower() != lc:
                out.insert(0, suggestion)
    except ImportError:
        pass

    return _uniq([x for x in out if x.strip() and x.lower() != lc])[:8]


async def hoby_spell_suggestions(
    conn: asyncpg.Connection,
    *,
    slug: str | None,
    display_name: str | None,
) -> dict[str, list[str]]:
    rows = await conn.fetch("SELECT slug, display_name FROM hobies")
    slugs = sorted({str(r["slug"]) for r in rows})
    names = sorted({str(r["display_name"]) for r in rows if r.get("display_name")})

    slug_suggestions: list[str] = []
    slug_probe = (str(slug).strip() if slug else "") or (
        derive_hoby_slug(str(display_name)) if display_name and str(display_name).strip() else ""
    )
    if slug_probe:
        slug_suggestions = _suggest_slug(slug_probe, slugs)

    display_suggestions: list[str] = []
    if display_name and str(display_name).strip():
        display_suggestions = _suggest_display_name(str(display_name), names)

    return {"slugSuggestions": slug_suggestions, "displayNameSuggestions": display_suggestions}

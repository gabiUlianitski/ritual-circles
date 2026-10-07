"""Circle name is who the community is. The hobby remains what they do."""

from __future__ import annotations

CIRCLE_NAME_MAX = 80
CIRCLE_DESCRIPTION_MAX = 500
GENERIC_CIRCLE_TITLE = "Circle"


def normalize_circle_name(raw: object) -> str | None:
    """Trim ends. Blank becomes None. Internal spaces stay. Over-long input is rejected by the caller."""
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def name_too_long(name: str | None) -> bool:
    return bool(name) and len(name) > CIRCLE_NAME_MAX


def normalize_circle_description(raw: object) -> str | None:
    """Trim ends. Blank becomes None. Internal line breaks stay."""
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def description_too_long(text: str | None) -> bool:
    return bool(text) and len(text) > CIRCLE_DESCRIPTION_MAX


def circle_identity(
    name: object,
    hobby_display_name: object,
    ritual_type: object,
) -> tuple[str | None, str, bool, str | None]:
    """Return stored name, displayTitle, hasCustomName, hobbyDisplayName."""
    stored = normalize_circle_name(name)
    hobby = str(hobby_display_name).strip() if hobby_display_name is not None else ""
    hobby_name = hobby or None
    slug = str(ritual_type).strip() if ritual_type is not None else ""
    has_custom = stored is not None
    if has_custom and stored is not None:
        title = stored
    elif hobby_name:
        title = hobby_name
    elif slug:
        title = slug
    else:
        title = GENERIC_CIRCLE_TITLE
    return stored, title, has_custom, hobby_name

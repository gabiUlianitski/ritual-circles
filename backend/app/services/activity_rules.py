"""Field rules for an Activity. No session or attendance coupling."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from app.services.activity_recurrence import parse_weekly_rule, rule_matches_start

ActivityStatus = ("draft", "open", "confirmed", "cancelled", "completed")
_STATUS_CHANGES = {
    ("draft", "open"),
    ("draft", "cancelled"),
    ("open", "confirmed"),
    ("open", "cancelled"),
    ("confirmed", "completed"),
    ("confirmed", "cancelled"),
}
ActivityRecurrence = ("one_time", "recurring")
ActivityPayment = ("free", "paid")


def ensure_status_change(current: str, new: str) -> None:
    if new == current:
        return
    if (current, new) not in _STATUS_CHANGES:
        raise ValueError("This activity status cannot change that way")


def _blank(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _money(value: object) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Enter a valid price") from exc
    if amount < 0:
        raise ValueError("Price must be zero or greater")
    return amount.quantize(Decimal("0.01"))


def prepare_activity_fields(
    *,
    title: object,
    description: object,
    start_at: datetime,
    end_at: datetime | None,
    recurrence_type: str,
    recurrence_rule: object,
    location_name: object,
    location_address: object,
    group_size: int | None,
    payment_type: str,
    price_amount: object,
    currency: object,
    status: str,
    require_group_size: bool,
    min_participants: int | None = None,
) -> dict[str, object]:
    clean_title = _blank(title)
    if not clean_title:
        raise ValueError("Title is required")
    if recurrence_type not in ActivityRecurrence:
        raise ValueError("Recurrence must be one_time or recurring")
    if payment_type not in ActivityPayment:
        raise ValueError("Payment must be free or paid")
    if status not in ActivityStatus:
        raise ValueError("Status must be draft, open, cancelled, or completed")

    start = _aware(start_at)
    end = _aware(end_at) if end_at is not None else None
    if end is not None and end <= start:
        raise ValueError("End time must be after the start time")

    rule = _blank(recurrence_rule)
    if recurrence_type == "one_time":
        if rule is not None:
            raise ValueError("A one-time activity does not use a recurrence rule")
    elif rule is None:
        raise ValueError("A recurring activity needs a recurrence rule")
    elif parse_weekly_rule(rule) is None:
        raise ValueError("A recurring activity needs a weekly day and time, like Sat 10:00")
    elif not rule_matches_start(rule, start):
        raise ValueError("The first date must fall on the weekly day and time")

    size = group_size
    if size is None:
        if require_group_size:
            raise ValueError("Group size is required")
    elif not isinstance(size, int) or isinstance(size, bool) or size <= 0:
        raise ValueError("Group size must be greater than zero")
    minimum = min_participants if min_participants is not None else size
    if minimum is None:
        if require_group_size:
            raise ValueError("Minimum participants is required")
    elif not isinstance(minimum, int) or isinstance(minimum, bool) or minimum <= 0:
        raise ValueError("Minimum participants must be greater than zero")
    elif size is not None and minimum > size:
        raise ValueError("Minimum participants cannot be greater than group size")

    amount = _money(price_amount)
    code = _blank(currency)
    if code is not None:
        code = code.upper()
    if payment_type == "free":
        if amount is not None and amount > 0:
            raise ValueError("A free activity has no price")
        amount = None
        if code is not None:
            raise ValueError("A free activity has no currency")
        code = None
    else:
        if amount is None:
            raise ValueError("A paid activity needs a price")
        if code is None or len(code) != 3 or not code.isalpha():
            raise ValueError("A paid activity needs a 3-letter currency")

    return {
        "title": clean_title,
        "description": _blank(description),
        "start_at": start,
        "end_at": end,
        "recurrence_type": recurrence_type,
        "recurrence_rule": rule,
        "location_name": _blank(location_name),
        "location_address": _blank(location_address),
        "group_size": size,
        "min_participants": minimum,
        "payment_type": payment_type,
        "price_amount": amount,
        "currency": code,
        "status": status,
    }

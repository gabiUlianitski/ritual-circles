from __future__ import annotations

from datetime import datetime, time, timedelta, timezone


_WEEKDAYS = {
    "mon": 0,
    "tue": 1,
    "wed": 2,
    "thu": 3,
    "fri": 4,
    "sat": 5,
    "sun": 6,
}


def parse_recurring_time(recurring_time: str) -> tuple[list[int], time]:
    """
    Parse stored recurringTime text.

    Supported forms:
    - Single day: "Mon 18:00" or "mon 18:00:00"
    - Multiple days (same clock time): "Mon,Wed 18:00" or "Mon Wed Fri 18:00"
    Weekdays are Mon..Sun (Monday = 0, matching datetime.weekday()).
    """
    parts = recurring_time.strip().split()
    if len(parts) < 2:
        raise ValueError("recurringTime must include at least one weekday and a time, e.g. 'Mon 18:00'")
    hm = parts[-1]
    day_blob = " ".join(parts[:-1])
    tokens = [t for t in day_blob.replace(",", " ").split() if t.strip()]
    if not tokens:
        raise ValueError("recurringTime must list at least one weekday")
    weekdays: list[int] = []
    seen: set[int] = set()
    for tok in tokens:
        w = _WEEKDAYS.get(tok.strip().lower()[:3])
        if w is None:
            raise ValueError("recurringTime weekday tokens must be Mon..Sun")
        if w not in seen:
            seen.add(w)
            weekdays.append(w)
    weekdays.sort()
    hm_parts = hm.split(":")
    if len(hm_parts) < 2:
        raise ValueError("recurringTime time must be HH:MM")
    hh = int(hm_parts[0])
    mm = int(hm_parts[1])
    tod = time(hour=hh, minute=mm, tzinfo=timezone.utc)
    return weekdays, tod


def next_occurrence_utc(recurring_time: str, *, now: datetime | None = None) -> datetime:
    """
    Earliest upcoming slot (strictly after `now` is not required; strictly > now).
    """
    weekdays, tod = parse_recurring_time(recurring_time)
    if now is None:
        now = datetime.now(tz=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    best: datetime | None = None
    for weekday in weekdays:
        days_ahead = (weekday - now.weekday()) % 7
        cand_date = now.date() + timedelta(days=days_ahead)
        cand = datetime.combine(cand_date, tod, tzinfo=timezone.utc)
        if cand <= now:
            cand = cand + timedelta(days=7)
        if best is None or cand < best:
            best = cand
    if best is None:
        raise ValueError("recurringTime must include at least one weekday")
    return best


def next_session_datetime_after(prev: datetime, recurring_time: str) -> datetime:
    """Next scheduled slot strictly after `prev` (for chaining sessions / replenishment)."""
    weekdays, tod = parse_recurring_time(recurring_time)
    wd_set = set(weekdays)
    prev_n = prev if prev.tzinfo else prev.replace(tzinfo=timezone.utc)
    start_date = prev_n.date()
    for i in range(0, 400):
        d = start_date + timedelta(days=i)
        wd = d.weekday()
        if wd in wd_set:
            cand = datetime.combine(d, tod, tzinfo=timezone.utc)
            if cand > prev_n:
                return cand
    raise ValueError("next_session_datetime_after: no slot found")

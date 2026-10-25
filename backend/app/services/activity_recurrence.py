"""Weekly dates for a recurring Activity. Pure calculation, no database access.

A rule is "<Day> <HH:MM>", for example "Sat 10:00", as the creator saw it when choosing the first date.
The first date must show that day and time at some real UTC offset (within 14 hours).

No time zone is stored for an Activity, so dates repeat on a fixed UTC rhythm:
every date is the first date plus whole weeks of 7 x 24 hours. Across a daylight-saving
change the UTC time stays the same and the local clock time can move by an hour.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

ROLLING_DATES = 6
WEEK = timedelta(weeks=1)

_DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_RULE = re.compile(r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})$")
_WEEK_MINUTES = 7 * 24 * 60
_MAX_OFFSET_MINUTES = 14 * 60


def _utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def parse_weekly_rule(rule: str | None) -> tuple[int, int] | None:
    """(weekday Mon=0, minute of the day), or None when the rule is not "<Day> <HH:MM>"."""
    if not rule:
        return None
    match = _RULE.match(rule.strip())
    if not match:
        return None
    hour, minute = int(match.group(2)), int(match.group(3))
    if hour > 23 or minute > 59:
        return None
    return _DAYS.index(match.group(1)), hour * 60 + minute


def rule_offset(rule: str | None, start_at: datetime) -> timedelta | None:
    """The UTC offset at which start_at falls on the rule's day and time, or None if none does.

    Only used to check the first date. Dates are never generated with this offset.
    """
    parsed = parse_weekly_rule(rule)
    if parsed is None:
        return None
    day, minute_of_day = parsed
    start = _utc(start_at)
    utc_minute = start.weekday() * 24 * 60 + start.hour * 60 + start.minute
    diff = (day * 24 * 60 + minute_of_day - utc_minute) % _WEEK_MINUTES
    if diff > _WEEK_MINUTES // 2:
        diff -= _WEEK_MINUTES
    if abs(diff) > _MAX_OFFSET_MINUTES or diff % 15:
        return None
    return timedelta(minutes=diff)


def rule_matches_start(rule: str | None, start_at: datetime) -> bool:
    return rule_offset(rule, start_at) is not None


def recurring_occurrence_times(
    *,
    first_slot: datetime,
    duration: timedelta | None,
    after: datetime | None,
    count: int,
) -> list[tuple[datetime, datetime | None]]:
    """The next `count` weekly slots strictly after `after` (from the first slot when None).

    Each slot is first_slot plus whole weeks in UTC, paired with its end when a duration is known.
    """
    first = _utc(first_slot)
    index = 0
    if after is not None:
        since = _utc(after) - first
        if since >= timedelta(0):
            index = since // WEEK + 1
    times: list[tuple[datetime, datetime | None]] = []
    for step in range(index, index + max(count, 0)):
        begin = first + step * WEEK
        times.append((begin, None if duration is None else begin + duration))
    return times

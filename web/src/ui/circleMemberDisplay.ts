import type { CircleMemberResponse } from "../api/types";
import { formatAvailabilityWindows } from "../availabilityWindows";

export function formatMemberAvailability(m: CircleMemberResponse): string {
  const windows = formatAvailabilityWindows(m.availabilityWindows);
  if (windows) return windows;
  const day = m.availability_day?.trim();
  const raw = m.availability_time?.trim();
  const time = raw ? raw.slice(0, 5) : null;
  if (day && time) return `${day} · ${time}`;
  if (day) return day;
  if (time) return time;
  return "—";
}

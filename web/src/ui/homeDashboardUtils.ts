import { dateLocale } from "../dateLocale";

/** Hero card time line — e.g. Fri Oct 9 • 20:00 */
export function formatSessionDateTimeHero(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = dateLocale();
  const day = d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} • ${time}`;
}

/** Month and time only, e.g. Oct 14 • 17:00. */
export function formatUpcomingDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = dateLocale();
  const date = d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} • ${time}`;
}

export function upcomingBadge(daysAway: number): { key: string; count?: number } {
  if (daysAway <= 0) return { key: "homeMoments.badgeToday" };
  if (daysAway === 1) return { key: "homeMoments.badgeTomorrow" };
  if (daysAway >= 7 && daysAway < 14) return { key: "homeMoments.badgeNextWeek" };
  return { key: "homeMoments.badgeInDays", count: daysAway };
}

export function formatSessionEventParts(iso: string): { date: string; time: string; daysAway: number } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "", daysAway: 0 };
  const locale = dateLocale();
  const date = d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return { date, time, daysAway: Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000)) };
}

/** Compact social line, e.g. "2 members joined • 4 spots available". */
export function formatJoinedLine(
  memberCount: number,
  _maxSize: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const joined = Math.max(0, memberCount);
  const members = joined === 1 ? t("home.oneMemberJoined") : t("home.membersJoined", { count: joined });
  return members;
}

export function activityTypeClass(ritualType: string): string {
  const slug = ritualType.trim().toLowerCase().replace(/-/g, "_");
  const known = ["tennis", "chess", "bicycle", "coffee", "dancing", "cooking"];
  if (known.includes(slug)) return `home-calendar-day-chip--type-${slug === "bicycle" ? "cycling" : slug}`;
  return "home-calendar-day-chip--type-default";
}

export function dateToIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(dateLocale(), { weekday: "long", month: "short", day: "numeric" });
}

import type { HomeCalendarSession } from "../api/types";
import { dateLocale } from "../dateLocale";
import { circleHobyTitle } from "./circleDisplay";

export function sessionTitle(item: HomeCalendarSession): string {
  return item.hobyDisplayName?.trim() || circleHobyTitle({ ritualType: item.ritualType, recurringTime: "" });
}

export function getUpcomingSessions(sessions: HomeCalendarSession[]): HomeCalendarSession[] {
  const now = Date.now();
  return [...sessions]
    .filter((s) => new Date(s.session.dateTime).getTime() >= now - 60_000)
    .sort((a, b) => new Date(a.session.dateTime).getTime() - new Date(b.session.dateTime).getTime());
}

export function countActivitiesThisWeek(sessions: HomeCalendarSession[]): number {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return getUpcomingSessions(sessions).filter((s) => {
    const d = new Date(s.session.dateTime);
    return d <= weekEnd;
  }).length;
}

export function daysUntilNextSession(sessions: HomeCalendarSession[]): number | null {
  const next = getUpcomingSessions(sessions)[0];
  if (!next) return null;
  const d = new Date(next.session.dateTime);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function formatSessionDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const locale = dateLocale();
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (dayDiff === 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Tomorrow · ${time}`;
  const day = d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

/** Hero card time line — e.g. Tue, Jun 16 · 18:00 */
export function formatSessionDateTimeHero(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = dateLocale();
  const day = d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} · ${time}`;
}

export function activityTypeClass(ritualType: string): string {
  const slug = ritualType.trim().toLowerCase().replace(/-/g, "_");
  const known = ["tennis", "chess", "bicycle", "coffee", "dancing", "cooking"];
  if (known.includes(slug)) return `home-calendar-day-chip--type-${slug === "bicycle" ? "cycling" : slug}`;
  return "home-calendar-day-chip--type-default";
}

export function isSessionPending(item: HomeCalendarSession): boolean {
  return item.myAttendance?.status !== "attending";
}

export function dateToIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(dateLocale(), { weekday: "long", month: "short", day: "numeric" });
}

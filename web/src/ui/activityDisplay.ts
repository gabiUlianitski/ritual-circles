import type { Activity } from "../api/types";
import { dateLocale } from "../dateLocale";

export function activityHasEnded(activity: Activity, now = Date.now()): boolean {
  const moment = activity.endAt ?? activity.startAt;
  const ms = new Date(moment).getTime();
  return !Number.isNaN(ms) && ms <= now;
}

export function activityStartMs(activity: Activity): number {
  const startAt = activity.recurrenceType === "recurring" ? activity.nextOccurrence?.startAt ?? activity.startAt : activity.startAt;
  const ms = new Date(startAt).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

export function isPastActivity(activity: Activity, now = Date.now()): boolean {
  if (activity.recurrenceType === "recurring" && activity.status !== "draft") {
    if (activity.status === "completed" || activity.status === "cancelled") return true;
    return !activity.nextOccurrence;
  }
  if (activity.status === "completed" || activity.status === "cancelled") return true;
  if (activity.status === "confirmed") return false;
  const ms = new Date(activity.startAt).getTime();
  if (Number.isNaN(ms)) return false;
  return ms < now;
}

export function splitActivities(items: Activity[], now = Date.now()): { upcoming: Activity[]; past: Activity[] } {
  const upcoming = items
    .filter((item) => !isPastActivity(item, now))
    .sort((a, b) => activityStartMs(a) - activityStartMs(b) || a.id.localeCompare(b.id));
  const past = items
    .filter((item) => isPastActivity(item, now))
    .sort((a, b) => activityStartMs(b) - activityStartMs(a) || b.id.localeCompare(a.id));
  return { upcoming, past };
}

function clock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function activityDetailWhen(activity: Activity): { date: string; time: string } {
  const start = new Date(activity.startAt);
  if (Number.isNaN(start.getTime())) return { date: "", time: "" };
  const date = start.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" });
  const lines = activityWhenLines(activity);
  return { date, time: lines.time };
}

export function activityWhenLines(activity: Activity): { date: string; time: string } {
  const start = new Date(activity.startAt);
  if (Number.isNaN(start.getTime())) return { date: "", time: "" };
  const date = start.toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
  const startTime = clock(activity.startAt);
  const endTime = activity.endAt ? clock(activity.endAt) : "";
  const time = endTime ? `${startTime} – ${endTime}` : startTime;
  return { date, time };
}

export function activityCardWhenLines(activity: Activity): { date: string; time: string } {
  if (activity.recurrenceType !== "recurring" || !activity.nextOccurrence) return activityWhenLines(activity);
  const { startAt, endAt } = activity.nextOccurrence;
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return { date: "", time: "" };
  const date = start.toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
  const startTime = clock(startAt);
  const endTime = endAt ? clock(endAt) : "";
  return { date, time: endTime ? `${startTime} – ${endTime}` : startTime };
}

export function occurrenceWhen(startAt: string, endAt?: string | null): { date: string; time: string } {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return { date: "", time: "" };
  const date = start.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" });
  const startTime = clock(startAt);
  const endTime = endAt ? clock(endAt) : "";
  return { date, time: endTime ? `${startTime} – ${endTime}` : startTime };
}

export function activityPriceLabel(activity: Pick<Activity, "paymentType" | "priceAmount" | "currency">): string | null {
  if (activity.paymentType !== "paid") return null;
  const raw = activity.priceAmount;
  const amount = typeof raw === "number" ? raw : raw != null && raw !== "" ? Number(raw) : NaN;
  const currency = activity.currency?.trim().toUpperCase() ?? "";
  if (!Number.isFinite(amount) || currency.length !== 3) return null;
  try {
    return new Intl.NumberFormat(dateLocale(), {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

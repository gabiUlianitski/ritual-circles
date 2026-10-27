import type { Activity } from "../api/types";
import { dateLocale } from "../dateLocale";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type ActivityParticipationFacts = {
  goingCount: number;
  groupSize: number;
  remainingNeeded: number;
  remainingPlaces: number;
  isReady: boolean;
  isFull: boolean;
};

export type ActivityParticipationDisplay = {
  countLabel: string;
  secondaryLabel: string | null;
  readinessLabel: string | null;
  fullLabel: string | null;
};

/** Labels for server-calculated participation. Does not decide readiness itself. */
export function activityParticipationDisplay(
  summary: ActivityParticipationFacts,
  t: Translate,
): ActivityParticipationDisplay {
  const spots =
    summary.remainingPlaces === 1
      ? t("activityParticipation.spotLeft")
      : t("activityParticipation.spotsLeft", { count: summary.remainingPlaces });
  return {
    countLabel: t("activityParticipation.goingCount", { count: summary.goingCount, size: summary.groupSize }),
    secondaryLabel:
      !summary.isReady && summary.remainingNeeded > 0
        ? t("activityParticipation.lookingForMore", { count: summary.remainingNeeded })
        : summary.isReady && !summary.isFull && summary.remainingPlaces > 0
          ? spots
          : null,
    readinessLabel: summary.isReady ? t("activityParticipation.readyToHappen") : null,
    fullLabel: summary.isFull ? t("activityParticipation.full") : null,
  };
}

export function activityReadinessLabel(
  participation: { isFull: boolean; isReady: boolean; remainingNeeded: number; remainingPlaces?: number; goingCount?: number; groupSize?: number },
  t: Translate,
): string {
  const display = activityParticipationDisplay(
    {
      goingCount: participation.goingCount ?? 0,
      groupSize: participation.groupSize ?? 0,
      remainingNeeded: participation.remainingNeeded,
      remainingPlaces: participation.remainingPlaces ?? 0,
      isReady: participation.isReady,
      isFull: participation.isFull,
    },
    t,
  );
  if (!participation.isReady && participation.remainingNeeded > 0) return display.secondaryLabel ?? "";
  if (participation.isFull) return display.fullLabel ?? "";
  if (participation.isReady) return display.readinessLabel ?? "";
  return "";
}

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

/** A short place for a card. A long address stays on Activity Details. */
export function activityCardPlace(name?: string | null, address?: string | null): string {
  const place = name?.trim() ?? "";
  const full = address?.trim() ?? "";
  if (place && full && full.length <= 32 && !full.includes(",")) return `${place} · ${full}`;
  if (place) return place;
  const first = full.split(",")[0]?.trim() ?? "";
  if (first.length > 48) return `${first.slice(0, 45)}…`;
  return first;
}

export function activityScheduleLine(startAt: string, endAt?: string | null): string {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return "";
  const date = start.toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
  const startTime = clock(startAt);
  const endTime = endAt ? clock(endAt) : "";
  const time = endTime ? `${startTime} – ${endTime}` : startTime;
  return [date, time].filter(Boolean).join(" · ");
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

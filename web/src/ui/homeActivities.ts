import type { Activity, HomeActivityItem } from "../api/types";

export function homeActivityKey(item: HomeActivityItem): string {
  return item.occurrenceId ? `${item.activityId}:${item.occurrenceId}` : item.activityId;
}

function startMs(item: HomeActivityItem): number {
  const ms = new Date(item.startAt).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** Drops entries that ended since Home loaded; keeps the server order otherwise. */
export function upcomingHomeActivities(items: HomeActivityItem[] | undefined, now = Date.now()): HomeActivityItem[] {
  return [...(items ?? [])]
    .filter((item) => {
      const ms = new Date(item.endAt ?? item.startAt).getTime();
      return Number.isNaN(ms) || ms > now;
    })
    .sort(
      (a, b) =>
        startMs(a) - startMs(b) ||
        a.activityId.localeCompare(b.activityId) ||
        (a.occurrenceId ?? "").localeCompare(b.occurrenceId ?? ""),
    );
}

export function homeActivityPlace(item: HomeActivityItem): string {
  const name = item.locationName?.trim();
  if (name) return name;
  return item.locationAddress?.trim().split(",")[0].trim() ?? "";
}

export function needsReconfirmation(item: HomeActivityItem): boolean {
  return Boolean(item.participation.confirmationRequired);
}

/** An upcoming Activity inside a Circle the user can open, whether or not they have joined it. */
export function homeItemFromCircleActivity(
  activity: Activity,
  circle: { name: string; icon?: string | null; ritualType?: string | null },
  now = Date.now(),
): HomeActivityItem | null {
  if (activity.status === "draft" || activity.status === "cancelled" || activity.status === "completed") return null;
  const next = activity.recurrenceType === "recurring" ? activity.nextOccurrence ?? null : null;
  if (activity.recurrenceType === "recurring") {
    if (!next || next.status === "cancelled" || next.status === "completed") return null;
    const end = new Date(next.endAt ?? next.startAt).getTime();
    if (!Number.isNaN(end) && end <= now) return null;
  } else {
    const end = new Date(activity.endAt ?? activity.startAt).getTime();
    if (!Number.isNaN(end) && end <= now) return null;
  }
  const participation = next?.participation ?? activity.participation;
  if (!participation) return null;
  const status = next?.status ?? activity.status;
  if (status !== "open" && status !== "confirmed") return null;
  return {
    activityId: activity.id,
    occurrenceId: next?.id ?? null,
    circleId: activity.circleId,
    circleName: circle.name,
    title: activity.title,
    ritualType: circle.ritualType ?? "",
    hobyIcon: circle.icon ?? null,
    isRecurring: activity.recurrenceType === "recurring",
    startAt: next?.startAt ?? activity.startAt,
    endAt: next?.endAt ?? activity.endAt,
    locationName: next?.locationName || activity.locationName,
    locationAddress: next?.locationAddress || activity.locationAddress,
    paymentType: activity.paymentType,
    priceAmount: activity.priceAmount,
    currency: activity.currency,
    status,
    participation,
  };
}

/** One card per Activity, using the next date. Later dates stay on Activity Details. */
export function upcomingActivityCards(items: HomeActivityItem[]): { item: HomeActivityItem; additionalDates: number }[] {
  const groups = new Map<string, HomeActivityItem[]>();
  for (const item of items) {
    const rows = groups.get(item.activityId);
    if (rows) rows.push(item);
    else groups.set(item.activityId, [item]);
  }
  return [...groups.values()]
    .map((rows) => ({ item: rows[0], additionalDates: Math.max(rows.length - 1, 0) }))
    .sort(
      (a, b) =>
        startMs(a.item) - startMs(b.item) || a.item.activityId.localeCompare(b.item.activityId),
    );
}

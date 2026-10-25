import type { HomeActivityItem } from "../api/types";

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

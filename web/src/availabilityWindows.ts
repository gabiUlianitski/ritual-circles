export const AVAILABILITY_WINDOW_OPTIONS = [
  { key: "weekday_mornings", label: "Weekday mornings" },
  { key: "weekday_evenings", label: "Weekday evenings" },
  { key: "weekends", label: "Weekends" },
  { key: "holidays", label: "Holidays" },
] as const;

export type AvailabilityWindowKey = (typeof AVAILABILITY_WINDOW_OPTIONS)[number]["key"];

export function normalizeAvailabilityWindows(items: string[] | null | undefined): AvailabilityWindowKey[] {
  const allowed = new Set<string>(AVAILABILITY_WINDOW_OPTIONS.map((o) => o.key));
  const seen = new Set<string>();
  for (const raw of items ?? []) {
    const key = String(raw).trim().toLowerCase();
    if (allowed.has(key)) seen.add(key);
  }
  return AVAILABILITY_WINDOW_OPTIONS.map((o) => o.key).filter((k) => seen.has(k));
}

export function formatAvailabilityWindows(windows: string[] | null | undefined): string {
  const normalized = normalizeAvailabilityWindows(windows);
  if (!normalized.length) return "";
  return AVAILABILITY_WINDOW_OPTIONS.filter((o) => normalized.includes(o.key))
    .map((o) => o.label)
    .join(", ");
}

/** Catalogue level keys may be numeric ("1") or textual ("beginner"). */
export type HobyLevelKey = string | number;

export function parseHobyLevelKey(raw: string): HobyLevelKey | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  return t;
}

export function levelKeyIsSet(level: unknown): boolean {
  if (level == null || level === "") return false;
  if (typeof level === "number") return Number.isFinite(level);
  if (typeof level === "string") return level.trim().length > 0;
  return false;
}

export function levelKeyToString(level: HobyLevelKey | null | undefined): string {
  if (level == null) return "";
  return String(level);
}

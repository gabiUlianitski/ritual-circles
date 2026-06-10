/** Shared parsing: Hoby → Type; levels live in `levels_json` (one ladder for all types). Legacy rows may nest levels under a type. */

export type HobyLevelRow = { key: string; label?: string; description?: string };

export type HobyTypeRow = {
  key: string;
  label?: string;
  description?: string;
  /** Legacy only: per-type levels. Prefer hoby-level `levels_json`. */
  levels: HobyLevelRow[];
};

function parseJsonIfString<T>(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function parseHobyLevelsFlat(levels: unknown): HobyLevelRow[] {
  let v = parseJsonIfString(levels);
  if (!v || typeof v !== "object") return [];
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((x) => ({
      key: String(x!["key"] ?? x!["level"] ?? ""),
      label: x!["label"] != null ? String(x!["label"]) : undefined,
      description: x!["description"] != null ? String(x!["description"]) : undefined,
    }))
    .filter((x) => x.key.length > 0);
}

export function parseHobyTypesNested(types: unknown): HobyTypeRow[] {
  let v = parseJsonIfString(types);
  if (!v || typeof v !== "object") return [];
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((x) => {
      const key = String(x!["key"] ?? x!["type"] ?? "").trim();
      if (!key) return null;
      const label = x!["label"] != null ? String(x!["label"]) : undefined;
      const description = x!["description"] != null ? String(x!["description"]) : undefined;
      const levels = parseHobyLevelsFlat(x!["levels"]);
      return { key, label, description, levels } satisfies HobyTypeRow;
    })
    .filter(Boolean) as HobyTypeRow[];
}

/** Shared ladder from `levels_json` when present; else per-type nested levels (legacy). */
export const SUBCATEGORY_ANY = "__any__";
export const SUBCATEGORY_ANY_LABEL = "Any style";

export function isSubcategoryAny(typeKey: string): boolean {
  return typeKey === SUBCATEGORY_ANY;
}

export function levelsForSelectedType(
  hobyLevelsFlat: HobyLevelRow[],
  types: HobyTypeRow[],
  typeKey: string,
): HobyLevelRow[] {
  if (isSubcategoryAny(typeKey) && hobyLevelsFlat.length > 0) return hobyLevelsFlat;
  if (hobyLevelsFlat.length > 0) return hobyLevelsFlat;
  const t = types.find((x) => x.key === typeKey);
  return t?.levels ?? [];
}

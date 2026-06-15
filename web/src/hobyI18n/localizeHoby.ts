import type { Hoby } from "../api/types";
import heCatalog from "./heCatalog.json";

type MetaTr = Record<string, { label?: string; description?: string }>;

const COMMON_LEVEL_HE: MetaTr = {
  beginner: { label: "מתחיל" },
  intermediate: { label: "בינוני" },
  advanced: { label: "מתקדם" },
  expert: { label: "מומחה" },
  master: { label: "מאסטר" },
  "1": { label: "מתחיל" },
  "2": { label: "בינוני" },
  "3": { label: "מתקדם" },
  "4": { label: "מומחה" },
  "5": { label: "מאסטר" },
};

type SlugCatalog = { types?: MetaTr; levels?: MetaTr; display_name?: string; short_description?: string };

const CATALOG = heCatalog as Record<string, SlugCatalog>;

function mergeMetaList(raw: unknown, tr: MetaTr | undefined, fallback?: MetaTr): unknown {
  if (!tr && !fallback) return raw;
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return raw;
    }
  }
  if (!Array.isArray(v)) return raw;
  return v.map((item) => {
    if (!item || typeof item !== "object") return item;
    const row = item as Record<string, unknown>;
    const key = String(row.key ?? row.level ?? "");
    const t = tr?.[key] ?? fallback?.[key];
    if (!t) return item;
    return {
      ...row,
      ...(t.label ? { label: t.label } : {}),
      ...(t.description ? { description: t.description } : {}),
    };
  });
}

/** Apply Hebrew catalog when API has not localized types/levels yet. */
export function localizeHoby(h: Hoby, lang: string): Hoby {
  if (lang !== "he") return h;
  const cat = CATALOG[h.slug];
  if (!cat) return h;
  return {
    ...h,
    displayName: cat.display_name?.trim() || h.displayName,
    shortDescription: cat.short_description?.trim() || h.shortDescription,
    types: mergeMetaList(h.types, cat.types) as Hoby["types"],
    levels: mergeMetaList(h.levels, cat.levels, COMMON_LEVEL_HE) as Hoby["levels"],
  };
}

export function localizeHobies(list: Hoby[], lang: string): Hoby[] {
  return list.map((h) => localizeHoby(h, lang));
}

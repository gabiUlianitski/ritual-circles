import type { Hoby } from "../api/types";
import { parseHobyLevelsFlat, parseHobyTypesNested } from "./hobyMetadata";

export const HOBY_CATEGORY_IDS = ["sports", "arts", "games", "learning", "social"] as const;
export type HobyCategoryId = (typeof HOBY_CATEGORY_IDS)[number];

export function stableCategory(raw: string | null | undefined): HobyCategoryId | null {
  const id = (raw ?? "").trim().toLowerCase();
  return (HOBY_CATEGORY_IDS as readonly string[]).includes(id) ? (id as HobyCategoryId) : null;
}

export type AttentionKey =
  | "missingName"
  | "missingCategory"
  | "missingDescription"
  | "missingDiscovery"
  | "missingIcon"
  | "missingTypes"
  | "missingTypeIcon"
  | "missingLevels"
  | "missingGroupSize"
  | "missingHebrewName"
  | "missingHebrewDescription";

/** First missing required field. A hobby icon and an icon on every type are required. */
export function hobbyAttention(h: Hoby): AttentionKey | null {
  if (!(h.canonicalDisplayName || h.displayName || "").trim()) return "missingName";
  if (!stableCategory(h.interestCategory)) return "missingCategory";
  if (!(h.canonicalShortDescription ?? h.shortDescription ?? "").trim()) return "missingDescription";
  if (!(h.discoveryDescription ?? "").trim()) return "missingDiscovery";
  if (!(h.icon ?? "").trim()) return "missingIcon";
  const types = parseHobyTypesNested(h.types);
  if (types.length === 0) return "missingTypes";
  if (types.some((row) => !(row.icon ?? "").trim())) return "missingTypeIcon";
  if (parseHobyLevelsFlat(h.levels).length === 0) return "missingLevels";
  if (!h.groupSize) return "missingGroupSize";
  if (!(h.heDisplayName ?? "").trim()) return "missingHebrewName";
  if (!(h.heShortDescription ?? "").trim()) return "missingHebrewDescription";
  return null;
}

export function hobbyIsComplete(h: Hoby): boolean {
  return hobbyAttention(h) == null;
}

export type HobbyStatus = "active" | "incomplete" | "archived";

/** Archived wins. Incomplete is missing required fields. Active is complete and visible. */
export function hobbyStatus(h: Hoby): HobbyStatus {
  if (h.archived) return "archived";
  if (hobbyAttention(h)) return "incomplete";
  return "active";
}

export function hobbyHasHebrew(h: Hoby): boolean {
  return Boolean((h.heDisplayName ?? "").trim());
}

/** Enough generated content to show the review, rather than the failure state. */
export function hobbyWasPrepared(h: Hoby): boolean {
  return Boolean(
    (h.shortDescription ?? "").trim() ||
      (h.icon ?? "").trim() ||
      parseHobyTypesNested(h.types).length ||
      parseHobyLevelsFlat(h.levels).length ||
      h.groupSize,
  );
}

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

export const INSIGHT_LIBRARY_SIZE = 50;
export const INSIGHT_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** Every missing required field, in the order an editor should fix them. */
export function hobbyGaps(h: Hoby): AttentionKey[] {
  const gaps: AttentionKey[] = [];
  if (!(h.canonicalDisplayName || h.displayName || "").trim()) gaps.push("missingName");
  if (!stableCategory(h.interestCategory)) gaps.push("missingCategory");
  if (!(h.canonicalShortDescription ?? h.shortDescription ?? "").trim()) gaps.push("missingDescription");
  if (!(h.discoveryDescription ?? "").trim()) gaps.push("missingDiscovery");
  if (!(h.icon ?? "").trim()) gaps.push("missingIcon");
  const types = parseHobyTypesNested(h.types);
  if (types.length === 0) gaps.push("missingTypes");
  else if (types.some((row) => !(row.icon ?? "").trim())) gaps.push("missingTypeIcon");
  if (parseHobyLevelsFlat(h.levels).length === 0) gaps.push("missingLevels");
  if (!h.groupSize) gaps.push("missingGroupSize");
  if (!(h.heDisplayName ?? "").trim()) gaps.push("missingHebrewName");
  if (!(h.heShortDescription ?? "").trim()) gaps.push("missingHebrewDescription");
  return gaps;
}

/** First missing required field. A hobby icon and an icon on every type are required. */
export function hobbyAttention(h: Hoby): AttentionKey | null {
  return hobbyGaps(h)[0] ?? null;
}

/** The day the stored library should be replaced. Null when it was never generated. */
export function insightExpiresAt(generatedAt: string | null | undefined): Date | null {
  if (!generatedAt) return null;
  const start = new Date(generatedAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + INSIGHT_LIFE_MS);
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

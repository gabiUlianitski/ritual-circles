import type { Hoby, UserHobyPreference } from "../api/types";
import { levelsForSelectedType, parseHobyLevelsFlat, parseHobyTypesNested } from "./hobyMetadata";

export function userHobyEntryKey(entry: UserHobyPreference): string {
  return `${entry.slug}|${entry.subtype ?? ""}|${entry.level ?? ""}`;
}

export function userHobyEntryLabel(
  catalogue: Hoby | undefined,
  entry: UserHobyPreference,
): string {
  if (!catalogue) return entry.slug;
  const types = parseHobyTypesNested(catalogue.types);
  const levelsFlat = parseHobyLevelsFlat(catalogue.levels);
  const typeLabel = types.find((t) => t.key === entry.subtype)?.label ?? entry.subtype;
  const levelRows = levelsForSelectedType(levelsFlat, types, entry.subtype ?? "");
  const levelLabel =
    entry.level != null
      ? levelRows.find((l) => l.key === String(entry.level))?.label ?? String(entry.level)
      : null;
  const parts = [catalogue.displayName];
  if (typeLabel) parts.push(typeLabel);
  if (levelLabel) parts.push(levelLabel);
  return parts.join(" · ");
}

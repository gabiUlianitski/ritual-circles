import type { CircleMemberResponse, CircleResponse, Hoby } from "../api/types";
import { levelsForSelectedType, parseHobyLevelsFlat, parseHobyTypesNested } from "./hobyMetadata";

export function findHobyCatalogue(hobies: Hoby[], ritualType: string): Hoby | undefined {
  const slug = ritualType.trim().toLowerCase();
  return hobies.find((h) => h.slug.trim().toLowerCase() === slug);
}

export function circleHobyTypeLevelLabels(
  circle: Pick<CircleResponse, "ritualType" | "ritualSubtype" | "ritualLevel">,
  catalogue: Hoby | undefined,
): { type: string; level: string } {
  const types = parseHobyTypesNested(catalogue?.types);
  const levelsFlat = parseHobyLevelsFlat(catalogue?.levels);
  const subtype = circle.ritualSubtype?.trim() ?? "";
  const typeLabel = subtype
    ? (types.find((t) => t.key === subtype)?.label ?? subtype.replace(/_/g, " "))
    : "—";
  const levelRows = levelsForSelectedType(levelsFlat, types, subtype);
  const levelLabel =
    circle.ritualLevel != null
      ? (levelRows.find((l) => l.key === String(circle.ritualLevel))?.label ?? String(circle.ritualLevel))
      : "—";
  return { type: typeLabel, level: levelLabel };
}

export function memberHobbyLevelLabel(
  member: CircleMemberResponse,
  circle: CircleResponse,
  catalogue: Hoby | undefined,
): string {
  if (member.hobby_level == null && !member.hobby_subtype?.trim()) {
    return "Level not set";
  }
  const types = parseHobyTypesNested(catalogue?.types);
  const levelsFlat = parseHobyLevelsFlat(catalogue?.levels);
  const subtype = member.hobby_subtype?.trim() ?? "";
  const levelRows = levelsForSelectedType(levelsFlat, types, subtype);
  if (member.hobby_level != null) {
    const label = levelRows.find((l) => l.key === String(member.hobby_level))?.label;
    if (label) return label;
    return `Level ${member.hobby_level}`;
  }
  return "Level not set";
}

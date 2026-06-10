import type { CircleListItem, Hoby, UserHobyPreference, UserMeResponse } from "../api/types";
import { levelKeyIsSet } from "./hobyLevelKey";
import { parseHobyLevelsFlat, parseHobyTypesNested } from "./hobyMetadata";

export function hobbiesFromMe(me: UserMeResponse | null | undefined): UserHobyPreference[] {
  if (!me) return [];
  if (me.userHobies?.length) return me.userHobies;
  if (me.preferred_hoby_slug?.trim()) {
    return [
      {
        slug: me.preferred_hoby_slug,
        subtype: me.preferred_hoby_subtype ?? null,
        level: me.preferred_hoby_level ?? null,
      },
    ];
  }
  return [];
}

function findCatalogue(hobies: Hoby[] | undefined, slug: string): Hoby | undefined {
  const target = slug.trim().toLowerCase();
  return hobies?.find((h) => h.slug.trim().toLowerCase() === target);
}

/** True when the hobby catalogue defines at least one level ladder. */
export function hobbyRequiresLevel(catalogue: Hoby | undefined): boolean {
  if (!catalogue) return true;
  const flat = parseHobyLevelsFlat(catalogue.levels);
  if (flat.length > 0) return true;
  const types = parseHobyTypesNested(catalogue.types);
  return types.some((t) => t.levels.length > 0);
}

/** User has this circle's hobby slug on profile; type when the catalogue has types; level when levels exist. */
export function userHasJoinableHobbyForCircle(
  userHobies: UserHobyPreference[],
  circle: Pick<CircleListItem, "ritualType" | "ritualSubtype" | "ritualLevel">,
  hobiesCatalog?: Hoby[],
): boolean {
  const slug = (circle.ritualType ?? "").trim().toLowerCase();
  if (!slug) return false;
  const catalogue = findCatalogue(hobiesCatalog, slug);
  const needLevel = hobbyRequiresLevel(catalogue);
  const needUserSubtype = parseHobyTypesNested(catalogue?.types).length > 0;

  for (const h of userHobies) {
    if ((h.slug ?? "").trim().toLowerCase() !== slug) continue;
    if (needLevel && !levelKeyIsSet(h.level)) continue;
    if (needUserSubtype && !(h.subtype?.trim())) continue;
    return true;
  }
  return false;
}

/** Short hint when Join is still blocked after the user saved a hobby. */
export function joinHobbyBlockedHint(
  userHobies: UserHobyPreference[],
  circle: Pick<CircleListItem, "ritualType" | "ritualSubtype" | "ritualLevel">,
  hobiesCatalog?: Hoby[],
): string | null {
  if (userHasJoinableHobbyForCircle(userHobies, circle, hobiesCatalog)) return null;
  const slug = (circle.ritualType ?? "").trim().toLowerCase();
  const catalogue = findCatalogue(hobiesCatalog, slug);
  const needLevel = hobbyRequiresLevel(catalogue);
  const needUserSubtype = parseHobyTypesNested(catalogue?.types).length > 0;
  const sameSlug = userHobies.filter((h) => (h.slug ?? "").trim().toLowerCase() === slug);
  if (!sameSlug.length) {
    return "Add this hobby to your profile with a type and level, then come back to join.";
  }
  if (needUserSubtype && sameSlug.every((h) => !(h.subtype?.trim()))) {
    return "Choose a type for this hobby on your profile (Profile → Hobbies).";
  }
  if (needLevel && sameSlug.every((h) => !levelKeyIsSet(h.level))) {
    return "Open Profile → Hobbies, tap Edit on this hobby, and choose your level.";
  }
  return null;
}

export function defaultHobbyDraftForCircle(
  circle: Pick<CircleListItem, "ritualType" | "ritualSubtype" | "ritualLevel">,
): UserHobyPreference {
  return {
    slug: (circle.ritualType ?? "").trim(),
    subtype: circle.ritualSubtype?.trim() || null,
    level: circle.ritualLevel ?? null,
  };
}

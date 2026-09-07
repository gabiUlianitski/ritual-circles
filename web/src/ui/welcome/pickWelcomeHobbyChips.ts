import type { CircleListItem, Hoby } from "../../api/types";

const MIN_CHIPS = 6;
const MAX_CHIPS = 10;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hobbyPopularity(circles: CircleListItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const circle of circles) {
    const slug = circle.ritualType?.trim().toLowerCase();
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

/** Pick 6–10 hobbies, prioritizing those with active circles, with light shuffle for variety. */
export function pickWelcomeHobbyChips(hobies: Hoby[], circles: CircleListItem[]): Hoby[] {
  if (hobies.length === 0) return [];

  const popularity = hobbyPopularity(circles);
  const ranked = [...hobies].sort((a, b) => {
    const aCount = popularity.get(a.slug.trim().toLowerCase()) ?? 0;
    const bCount = popularity.get(b.slug.trim().toLowerCase()) ?? 0;
    if (bCount !== aCount) return bCount - aCount;
    return a.displayName.localeCompare(b.displayName);
  });

  const targetCount = hobies.length >= MIN_CHIPS
    ? Math.min(MAX_CHIPS, hobies.length)
    : hobies.length;

  const popularPool = ranked.slice(0, Math.min(ranked.length, targetCount + 3));
  const picked = shuffle(popularPool).slice(0, targetCount);

  if (picked.length >= MIN_CHIPS || hobies.length <= picked.length) {
    return picked;
  }

  const remaining = shuffle(hobies.filter((h) => !picked.some((p) => p.slug === h.slug)));
  while (picked.length < MIN_CHIPS && remaining.length > 0) {
    picked.push(remaining.pop()!);
  }

  return picked.slice(0, MAX_CHIPS);
}

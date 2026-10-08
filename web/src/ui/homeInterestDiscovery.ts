import type { CircleListItem, Hoby } from "../api/types";
import { circleNearUser } from "./circleDiscover";
import { isCircleJoinable } from "./circleParticipation";

export type NewInterestMatch = {
  hobby: Hoby;
  score: number;
  activeCircles: number;
  upcomingActivities: number;
  relatedHobby: string | null;
};

function key(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isFuture(value: string | null | undefined, now: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= now;
}

function dailyTieBreak(slug: string, dayKey: string): number {
  let hash = 0;
  for (const char of `${dayKey}:${slug}`) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return hash;
}

/**
 * Hobby-level discovery using only real catalogue and circle data.
 * Existing user interests are excluded, and every result has a local/available opportunity.
 */
export function discoverNewInterests(input: {
  hobbies: Hoby[];
  circles: CircleListItem[];
  selectedSlugs: string[];
  city: string | null;
  dayKey: string;
  limit?: number;
}): NewInterestMatch[] {
  const selected = new Set(input.selectedSlugs.map(key).filter(Boolean));
  const selectedHobbies = input.hobbies.filter((hobby) => selected.has(key(hobby.slug)));
  const selectedCategories = new Set(
    selectedHobbies.map((hobby) => key(hobby.interestCategory)).filter(Boolean),
  );
  const now = Date.now();
  const useNearby = Boolean(input.city?.trim());

  return input.hobbies
    .filter(
      (hobby) =>
        !hobby.archived &&
        !selected.has(key(hobby.slug)) &&
        Boolean(hobby.discoveryDescription?.trim()),
    )
    .map((hobby): NewInterestMatch | null => {
      const slug = key(hobby.slug);
      const available = input.circles.filter(
        (circle) =>
          !circle.isYours &&
          key(circle.ritualType) === slug &&
          isCircleJoinable(circle.memberCount, circle.maxSize),
      );
      const opportunities = useNearby
        ? available.filter((circle) => circleNearUser(circle, input.city))
        : available;
      const active = opportunities.filter(
        (circle) =>
          circle.memberCount > 0 ||
          (circle.messagesToday ?? 0) > 0 ||
          (circle.messagesLastWeek ?? 0) > 0 ||
          isFuture(circle.nextSessionAt, now),
      );
      const upcoming = opportunities.filter((circle) => isFuture(circle.nextSessionAt, now));
      if (active.length === 0 && upcoming.length === 0) return null;

      const category = key(hobby.interestCategory);
      const related = category
        ? selectedHobbies.find((item) => key(item.interestCategory) === category) ?? null
        : null;
      const memberMomentum = active.reduce((total, circle) => total + circle.memberCount, 0);
      const score = Math.min(
        97,
        45 +
          (selectedCategories.has(category) ? 25 : 0) +
          Math.min(12, active.length * 4) +
          Math.min(10, upcoming.length * 5) +
          Math.min(5, memberMomentum) +
          (useNearby ? 5 : 0),
      );

      return {
        hobby,
        score,
        activeCircles: active.length,
        upcomingActivities: upcoming.length,
        relatedHobby: related?.displayName ?? null,
      };
    })
    .filter((match): match is NewInterestMatch => match != null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.upcomingActivities - a.upcomingActivities ||
        b.activeCircles - a.activeCircles ||
        dailyTieBreak(a.hobby.slug, input.dayKey) - dailyTieBreak(b.hobby.slug, input.dayKey),
    )
    .slice(0, input.limit ?? 2);
}

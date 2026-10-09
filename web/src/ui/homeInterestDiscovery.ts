import type { CircleListItem, Hoby } from "../api/types";
import { circleNearUser } from "./circleDiscover";
import { isCircleJoinable } from "./circleParticipation";

export type NewInterestMatch = {
  hobby: Hoby;
  score: number;
  activeCircles: number;
  upcomingActivities: number;
  relatedHobby: string | null;
  nearby: boolean;
  /** Interest affinity, or a nearby suggestion when nothing shares an interest. */
  reason: "interest" | "nearby";
};

/** Adjacent hobbies. Coffee can lead to wine; tennis can lead to padel. */
const NEIGHBORS: Record<string, string[]> = {
  coffee: ["wine", "tea", "beer", "cooking"],
  wine: ["coffee", "beer", "cooking"],
  tea: ["coffee"],
  beer: ["wine", "coffee"],
  cooking: ["coffee", "wine", "baking"],
  baking: ["cooking"],
  tennis: ["padel", "pickleball", "squash", "badminton"],
  padel: ["tennis", "pickleball", "squash"],
  pickleball: ["padel", "tennis"],
  squash: ["tennis", "padel"],
  badminton: ["tennis"],
  cycling: ["bicycle", "walking", "running", "hiking"],
  bicycle: ["cycling", "walking", "running", "hiking"],
  running: ["walking", "cycling", "hiking", "fitness"],
  walking: ["hiking", "cycling", "running"],
  hiking: ["walking", "cycling"],
  baseball: ["softball", "cricket"],
  photography: ["walking", "hiking", "travel"],
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

function relatedTo(slug: string, selected: Hoby[]): Hoby | null {
  const neighbors = new Set(NEIGHBORS[slug] ?? []);
  for (const [known, adjacent] of Object.entries(NEIGHBORS)) {
    if (adjacent.includes(slug)) neighbors.add(known);
  }
  return selected.find((hobby) => neighbors.has(key(hobby.slug))) ?? null;
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
  const now = Date.now();
  const mine = input.circles.filter((circle) => circle.isYours);

  const scored = input.hobbies
    .filter((hobby) => !hobby.archived && !selected.has(key(hobby.slug)))
    .map((hobby): (NewInterestMatch & { interestScore: number; locationScore: number; hasCircle: boolean }) | null => {
      const slug = key(hobby.slug);
      const available = input.circles.filter(
        (circle) =>
          !circle.isYours &&
          key(circle.ritualType) === slug &&
          isCircleJoinable(circle.memberCount, circle.maxSize),
      );
      const nearby = available.filter(
        (circle) =>
          circleNearUser(circle, input.city) ||
          mine.some((own) => circleNearUser(circle, own.cityName || own.city)),
      );
      const opportunities = nearby.length > 0 ? nearby : available;
      const active = opportunities.filter(
        (circle) =>
          circle.memberCount > 0 ||
          (circle.messagesToday ?? 0) > 0 ||
          (circle.messagesLastWeek ?? 0) > 0 ||
          isFuture(circle.nextSessionAt, now),
      );
      const upcoming = opportunities.filter((circle) => isFuture(circle.nextSessionAt, now));
      const category = key(hobby.interestCategory);
      const neighbor = relatedTo(slug, selectedHobbies);
      const sameCategory = category
        ? selectedHobbies.find((item) => key(item.interestCategory) === category) ?? null
        : null;
      const related = neighbor ?? sameCategory;
      const interestScore = neighbor ? 40 : sameCategory ? 25 : 0;
      const memberMomentum = active.reduce((total, circle) => total + circle.memberCount, 0);
      const locationScore = nearby.length > 0 ? 20 : 0;
      const score = Math.min(
        97,
        (interestScore > 0 ? 50 : 35) +
          interestScore +
          locationScore +
          Math.min(8, active.length * 2) +
          Math.min(5, memberMomentum),
      );

      return {
        hobby,
        score: interestScore > 0 ? score : Math.min(55, 35 + locationScore),
        activeCircles: Math.max(active.length, opportunities.length),
        upcomingActivities: upcoming.length,
        relatedHobby: related?.displayName ?? null,
        nearby: nearby.length > 0,
        reason: interestScore > 0 ? "interest" : "nearby",
        interestScore,
        locationScore,
        hasCircle: available.length > 0,
      };
    })
    .filter((match): match is NewInterestMatch & { interestScore: number; locationScore: number; hasCircle: boolean } => match != null);

  const pool = scored.filter((match) => match.hasCircle && match.interestScore > 0);
  return pool
    .sort(
      (a, b) =>
        b.interestScore - a.interestScore ||
        b.locationScore - a.locationScore ||
        b.upcomingActivities - a.upcomingActivities ||
        b.activeCircles - a.activeCircles ||
        dailyTieBreak(a.hobby.slug, input.dayKey) - dailyTieBreak(b.hobby.slug, input.dayKey),
    )
    .slice(0, input.limit ?? 2);
}

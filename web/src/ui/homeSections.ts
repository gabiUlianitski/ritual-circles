import type { CircleListItem, HomeCalendarSession, Hoby, UserHobyPreference } from "../api/types";
import { circleMomentum, momentumRank, type CircleMomentum } from "./CircleProgressCard";
import { getRecommendedCircles } from "./circleDiscover";
import { isCircleJoinable } from "./circleParticipation";
import { getUpcomingSessions, isSessionPending } from "./homeDashboardUtils";
import { rotateDaily } from "./homeMoments";

const HAPPENING_LIMIT = 8;
const INTEREST_LIMIT = 10;
const HERO_CHIP_LIMIT = 5;
const UPCOMING_LIMIT = 3;
const RECOMMENDED_LIMIT = 6;

const FALLBACK_INTERESTS: Array<Pick<Hoby, "slug" | "displayName" | "icon">> = [
  { slug: "coffee", displayName: "Coffee", icon: "☕" },
  { slug: "reading", displayName: "Reading", icon: "📚" },
  { slug: "cycling", displayName: "Cycling", icon: "🚴" },
  { slug: "walking", displayName: "Walking", icon: "🚶" },
  { slug: "photography", displayName: "Photography", icon: "📷" },
  { slug: "music", displayName: "Music", icon: "🎵" },
  { slug: "cooking", displayName: "Cooking", icon: "🍳" },
  { slug: "fitness", displayName: "Fitness", icon: "💪" },
  { slug: "travel", displayName: "Travel", icon: "✈️" },
  { slug: "games", displayName: "Games", icon: "🎲" },
];

export type HomeUpcoming =
  | { kind: "session"; item: HomeCalendarSession; needsAnswer: boolean }
  | { kind: "readyToSchedule"; circle: CircleListItem };

export type HomeInterest = { hoby: Hoby; circleCount: number };

export type HomeFeed = {
  /** Shown in the hero; the rest go to the Upcoming Activity section. */
  upcoming: HomeUpcoming[];
  /** Personal matches first, topped up with the fullest joinable circles (max 6). */
  recommended: CircleListItem[];
  interests: HomeInterest[];
  heroChips: HomeInterest[];
  happening: CircleListItem[];
  groupsForming: number;
};

/** Counts below this read as "empty"; show a warm status instead. */
export const MIN_VISIBLE_COUNT = 5;

/** i18n key for a warm social label used instead of a small participant count. */
export function socialStatusKey(input: { members: number; confirmed?: boolean }): string {
  if (input.confirmed) return "homeFeed.socialConfirmed";
  if (input.members >= 3) return "homeFeed.socialReady";
  return "homeFeed.socialJoining";
}

export function circleStatus(c: CircleListItem): CircleMomentum {
  return circleMomentum(c.memberCount, c.maxSize, Boolean(c.nextSessionAt));
}

function fillOf(c: CircleListItem): number {
  return c.memberCount / Math.max(1, c.maxSize);
}

function slugKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function mixForYou(input: {
  joinable: CircleListItem[];
  hobbies: UserHobyPreference[];
  hobyCatalog: Hoby[];
  city: string | null;
  others: CircleListItem[];
  rotationKey?: string;
}): CircleListItem[] {
  const { joinable, hobbies, hobyCatalog, city } = input;
  const liked = new Set(hobbies.map((h) => slugKey(h.slug)));
  const categoryBySlug = new Map(
    hobyCatalog.map((h) => [slugKey(h.slug), (h.interestCategory ?? "").trim().toLowerCase()]),
  );
  const likedCategories = new Set(
    [...liked].map((slug) => categoryBySlug.get(slug)).filter((category): category is string => Boolean(category)),
  );
  const spin = <T,>(items: T[], tier: string) =>
    input.rotationKey ? rotateDaily(items, `${input.rotationKey}:${tier}`) : items;
  const personal = getRecommendedCircles(joinable, hobbies, city, RECOMMENDED_LIMIT);
  const personalIds = new Set(personal.map((c) => c.id));
  const similar = joinable.filter((c) => {
    const category = categoryBySlug.get(slugKey(c.ritualType));
    return Boolean(category && likedCategories.has(category) && !personalIds.has(c.id));
  });
  const active = joinable.filter((c) => (c.messagesToday ?? 0) > 0 || (c.messagesLastWeek ?? 0) > 0);
  const fresh = joinable.filter((c) => c.memberCount <= 1);
  const popular = [...joinable].sort(byMomentum);
  const queues = [
    spin(personal, "personal"),
    spin(similar, "similar"),
    spin(active, "active"),
    spin(fresh, "fresh"),
    spin(popular, "popular"),
  ].map((items) => [...items]);
  const seen = new Set<string>();
  const mixed: CircleListItem[] = [];
  let progressed = true;
  while (mixed.length < RECOMMENDED_LIMIT && progressed) {
    progressed = false;
    for (const queue of queues) {
      while (queue.length > 0 && seen.has(queue[0].id)) queue.shift();
      const next = queue.shift();
      if (!next) continue;
      seen.add(next.id);
      mixed.push(next);
      progressed = true;
      if (mixed.length >= RECOMMENDED_LIMIT) break;
    }
  }
  if (mixed.length < RECOMMENDED_LIMIT) {
    for (const circle of spin([...input.others].sort(byMomentum), "more")) {
      if (seen.has(circle.id)) continue;
      seen.add(circle.id);
      mixed.push(circle);
      if (mixed.length >= RECOMMENDED_LIMIT) break;
    }
  }
  return mixed;
}

function byMomentum(a: CircleListItem, b: CircleListItem): number {
  return (
    momentumRank(circleStatus(a)) - momentumRank(circleStatus(b)) ||
    fillOf(b) - fillOf(a) ||
    b.memberCount - a.memberCount
  );
}

export function buildHomeFeed(input: {
  catalog: CircleListItem[];
  sessions: HomeCalendarSession[];
  hobbies: UserHobyPreference[];
  hobyCatalog: Hoby[];
  city: string | null;
  /** When false, the hobby catalogue has not loaded yet, so circle recommendations stay visible. */
  onlyCompleteHobbies?: boolean;
  /** Day + user key; rotates recommendation order once per day. */
  rotationKey?: string;
}): HomeFeed {
  const { catalog, hobbies, hobyCatalog, city } = input;

  const memberReady = catalog
    .filter((c) => c.isYours && circleStatus(c) === "readyToSchedule")
    .sort((a, b) => fillOf(b) - fillOf(a));

  const upcoming: HomeUpcoming[] = [
    ...getUpcomingSessions(input.sessions).map(
      (item): HomeUpcoming => ({ kind: "session", item, needsAnswer: isSessionPending(item) }),
    ),
    ...memberReady.map((circle): HomeUpcoming => ({ kind: "readyToSchedule", circle })),
  ].slice(0, 1 + UPCOMING_LIMIT);

  const completeSlugs = new Set(hobyCatalog.map((h) => slugKey(h.slug)));
  const listed =
    input.onlyCompleteHobbies === false
      ? catalog
      : catalog.filter((c) => c.isYours || completeSlugs.has(slugKey(c.ritualType)));
  const joinable = listed.filter((c) => !c.isYours && isCircleJoinable(c.memberCount, c.maxSize));

  const countBySlug = new Map<string, number>();
  for (const c of catalog) {
    const k = slugKey(c.ritualType);
    countBySlug.set(k, (countBySlug.get(k) ?? 0) + 1);
  }
  const userSlugs = new Set(hobbies.map((h) => slugKey(h.slug)));
  const bySlug = new Map<string, HomeInterest>();
  for (const hoby of hobyCatalog) {
    if (!hoby.slug?.trim() || !hoby.displayName?.trim()) continue;
    bySlug.set(slugKey(hoby.slug), { hoby, circleCount: countBySlug.get(slugKey(hoby.slug)) ?? 0 });
  }
  for (const c of catalog) {
    const slug = slugKey(c.ritualType);
    const displayName = (c.hobyDisplayName ?? "").trim();
    if (!slug || !displayName || bySlug.has(slug)) continue;
    bySlug.set(slug, {
      hoby: { id: slug, slug: c.ritualType.trim(), displayName, icon: c.hobyIcon ?? null, levels: [], types: [] },
      circleCount: countBySlug.get(slug) ?? 1,
    });
  }
  for (const fallback of FALLBACK_INTERESTS) {
    const slug = slugKey(fallback.slug);
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, {
      hoby: {
        id: `home-${slug}`,
        slug: fallback.slug,
        displayName: fallback.displayName,
        icon: fallback.icon,
        levels: [],
        types: [],
      },
      circleCount: countBySlug.get(slug) ?? 0,
    });
  }
  const interests: HomeInterest[] = [...bySlug.values()].sort(
    (a, b) =>
      Number(userSlugs.has(slugKey(b.hoby.slug))) - Number(userSlugs.has(slugKey(a.hoby.slug))) ||
      b.circleCount - a.circleCount ||
      a.hoby.displayName.localeCompare(b.hoby.displayName),
  );

  const joinedHobbies = [...hobbies];
  const seenHobby = new Set(hobbies.map((h) => slugKey(h.slug)));
  for (const circle of catalog) {
    if (!circle.isYours) continue;
    const slug = slugKey(circle.ritualType);
    if (!slug || seenHobby.has(slug)) continue;
    seenHobby.add(slug);
    joinedHobbies.push({ slug: circle.ritualType.trim() });
  }
  const recommended = mixForYou({
    joinable,
    hobbies: joinedHobbies,
    hobyCatalog,
    city,
    others: listed.filter((c) => !c.isYours),
    rotationKey: input.rotationKey,
  });

  const happening = joinable
    .filter((c) => {
      const s = circleStatus(c);
      return s === "readyToSchedule" || s === "almostReady" || s === "growing";
    })
    .sort(byMomentum)
    .slice(0, HAPPENING_LIMIT);

  return {
    upcoming,
    recommended,
    interests: interests.slice(0, INTEREST_LIMIT),
    heroChips: interests.slice(0, HERO_CHIP_LIMIT),
    happening,
    groupsForming: joinable.length,
  };
}

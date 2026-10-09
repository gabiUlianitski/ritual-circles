import type { TFunction } from "i18next";
import type { CircleListItem, CommunityStats } from "../api/types";
import { circleNearUser } from "./circleDiscover";
import { isCircleJoinable } from "./circleParticipation";

const DAY_MS = 86_400_000;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

function slugKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Same list order for a whole day; a different starting point the next day. */
export function rotateDaily<T>(items: T[], key: string): T[] {
  if (items.length < 2) return items;
  const start = hash(key) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function daysAway(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

function meetsThisWeekend(iso: string | null | undefined): boolean {
  const away = daysAway(iso);
  if (away == null || away < 0 || away > 6) return false;
  const day = new Date(iso as string).getDay();
  return day === 5 || day === 6 || day === 0;
}

function spotsLeft(c: CircleListItem): number {
  return Math.max(0, c.maxSize - c.memberCount);
}

export function hobbyName(c: CircleListItem, t: TFunction): string {
  const fallback = c.hobyDisplayName?.trim() || c.ritualType;
  return t(`homeFeed.interest_${slugKey(c.ritualType)}`, { defaultValue: fallback });
}

/** One short human signal for a circle, from real data only. */
export function circleSignal(c: CircleListItem, t: TFunction): string {
  const away = daysAway(c.nextSessionAt);
  const spots = spotsLeft(c);
  if ((c.messagesToday ?? 0) > 0) return t("homeMoments.signalChattingToday");
  if (away === 0) return t("homeMoments.signalMeetsToday");
  if (away === 1) return t("homeMoments.signalMeetsTomorrow");
  if (meetsThisWeekend(c.nextSessionAt)) return t("homeMoments.signalWeekend");
  if (!c.isYours && spots > 0 && spots <= 2) return t("homeFeed.proofSpotsLeft", { count: spots });
  if (!c.isYours && c.memberCount <= 1) return t("homeMoments.signalNew");
  if ((c.messagesLastWeek ?? 0) > 0) return t("homeFeed.proofActiveWeek");
  return t("homeMoments.signalOpen");
}

/** The one-sentence reason today's hero matters. Rotates daily across the true candidates. */
export function dailyMoment(input: {
  featured: CircleListItem;
  catalog: CircleListItem[];
  likedSlugs: string[];
  city: string | null;
  stats: CommunityStats | null;
  libraryInsight: string | null;
  dayKey: string;
  t: TFunction;
}): string {
  if (input.libraryInsight?.trim()) return input.libraryInsight.trim();
  const { featured, catalog, t } = input;
  const hobby = hobbyName(featured, t);
  const sameHobbyNear = catalog.filter(
    (c) =>
      !c.isYours &&
      slugKey(c.ritualType) === slugKey(featured.ritualType) &&
      isCircleJoinable(c.memberCount, c.maxSize) &&
      circleNearUser(c, input.city),
  ).length;
  const liked = new Set(input.likedSlugs.map(slugKey));
  const likedThisWeek = catalog.filter((c) => {
    const away = daysAway(c.nextSessionAt);
    return liked.has(slugKey(c.ritualType)) && away != null && away >= 0 && away <= 6;
  }).length;
  const away = daysAway(featured.nextSessionAt);
  const spots = spotsLeft(featured);

  const candidates = [
    sameHobbyNear >= 2 ? t("homeMoments.momentNearby", { count: sameHobbyNear, hobby }) : null,
    likedThisWeek >= 2 ? t("homeMoments.momentInterestsThisWeek", { count: likedThisWeek }) : null,
    away === 0 || away === 1
      ? t(away === 0 ? "homeMoments.momentMeetsToday" : "homeMoments.momentMeetsTomorrow", { hobby })
      : meetsThisWeekend(featured.nextSessionAt)
        ? t("homeMoments.momentWeekend", { hobby })
        : null,
    spots > 0 && spots <= 2 ? t("homeMoments.momentSpots", { count: spots }) : null,
    (featured.messagesToday ?? 0) > 0 ? t("homeMoments.momentChatting") : null,
    featured.memberCount <= 1 ? t("homeMoments.momentNew", { hobby }) : null,
    (input.stats?.meetupsThisWeek ?? 0) >= 2
      ? t("homeMoments.momentCommunityWeek", { count: input.stats?.meetupsThisWeek ?? 0 })
      : null,
  ].filter((x): x is string => Boolean(x && x.trim()));

  if (candidates.length === 0) return t("homeMoments.momentDefault", { hobby });
  return candidates[hash(`${input.dayKey}:${featured.id}:moment`) % candidates.length];
}

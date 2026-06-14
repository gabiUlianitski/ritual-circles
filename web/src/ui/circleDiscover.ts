import type { CircleListItem, Hoby, UserHobyPreference } from "../api/types";
import { formatDiscoverCardLocation } from "../venueCardDisplay";
import { weekdayFromIsoDate } from "./createCircleSchedule";
import { parseIsoDate } from "./calendarMonth";
import { levelKeyToString } from "./hobyLevelKey";

import { circleParticipationState } from "./circleParticipation";

export type DiscoverLevelFilter = "" | "beginner" | "intermediate" | "advanced";
export type DiscoverTimeFilter = "" | "morning" | "evening" | "weekend";
export type DiscoverSizeFilter = "" | "small" | "growing";

const LEVEL_BUCKETS: Record<Exclude<DiscoverLevelFilter, "">, string[]> = {
  beginner: ["beginner", "1", "novice", "starter", "casual"],
  intermediate: ["intermediate", "2", "medium"],
  advanced: ["advanced", "3", "expert", "pro"],
};

const WEEKEND_DAYS = new Set(["Sat", "Sun"]);
const TIME_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})$/;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function levelBucket(level: string | number | null | undefined): string | null {
  if (level == null || level === "") return null;
  const key = norm(String(level));
  for (const [bucket, keys] of Object.entries(LEVEL_BUCKETS) as [DiscoverLevelFilter, string[]][]) {
    if (keys.includes(key)) return bucket;
  }
  return key;
}

function levelsMatch(
  userLevel: string | number | null | undefined,
  circleLevel: string | number | null | undefined,
): boolean {
  if (userLevel == null || circleLevel == null) return false;
  return norm(String(userLevel)) === norm(String(circleLevel));
}

function parseRecurringTime(recurringTime: string): { day: string; hour: number } | null {
  const m = recurringTime.trim().match(TIME_RE);
  if (!m) return null;
  return { day: m[1], hour: parseInt(m[2], 10) };
}

function cityTokens(c: CircleListItem): string[] {
  return [c.cityName, c.city, c.meetingPlace, c.countryCode]
    .filter(Boolean)
    .map((x) => norm(String(x)));
}

function userCityTokens(userCity: string | null | undefined): string[] {
  if (!userCity?.trim()) return [];
  return userCity
    .split(/[,|]/)
    .map((p) => norm(p))
    .filter(Boolean);
}

function locationClose(circle: CircleListItem, userCity: string | null | undefined): boolean {
  const user = userCityTokens(userCity);
  if (!user.length) return false;
  const circleToks = cityTokens(circle);
  return user.some((u) => circleToks.some((c) => c.includes(u) || u.includes(c)));
}

function circleMatchesUserHobbySlug(
  circle: CircleListItem,
  userHobbies: UserHobyPreference[],
): boolean {
  const slug = norm(circle.ritualType);
  if (!slug) return false;
  return userHobbies.some((h) => norm(h.slug) === slug);
}

export function scoreCircleForUser(
  circle: CircleListItem,
  userHobbies: UserHobyPreference[],
  userCity?: string | null,
): number {
  let score = 0;
  const slug = norm(circle.ritualType);
  for (const h of userHobbies) {
    if (norm(h.slug) !== slug) continue;
    score += 3;
    if (levelsMatch(h.level, circle.ritualLevel)) score += 1;
    break;
  }
  if (locationClose(circle, userCity)) score += 1;
  return score;
}

export function getRecommendedCircles(
  circles: CircleListItem[],
  userHobbies: UserHobyPreference[],
  userCity?: string | null,
  limit = 5,
): CircleListItem[] {
  const candidates = circles.filter((c) => !c.isYours);
  if (!candidates.length) return [];

  return [...candidates]
    .filter((circle) => circleMatchesUserHobbySlug(circle, userHobbies))
    .map((circle) => ({
      circle,
      score: scoreCircleForUser(circle, userHobbies, userCity),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.circle.memberCount - a.circle.memberCount)
    .slice(0, limit)
    .map((x) => x.circle);
}

export function getActiveCircles(circles: CircleListItem[], limit = 5): CircleListItem[] {
  return [...circles]
    .filter((c) => !c.isYours && (c.messagesLastWeek ?? 0) > 0)
    .sort((a, b) => {
      const msg = (b.messagesLastWeek ?? 0) - (a.messagesLastWeek ?? 0);
      if (msg !== 0) return msg;
      const ta = a.nextSessionAt ? new Date(a.nextSessionAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.nextSessionAt ? new Date(b.nextSessionAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    })
    .slice(0, limit);
}

export function getNeedsMembersCircles(circles: CircleListItem[], limit = 5): CircleListItem[] {
  return [...circles]
    .filter((c) => !c.isYours && c.memberCount < 4)
    .sort((a, b) => a.memberCount - b.memberCount)
    .slice(0, limit);
}

export function isHighActivity(circle: CircleListItem): boolean {
  return (circle.messagesToday ?? 0) >= 2 || (circle.messagesLastWeek ?? 0) >= 5;
}

export function circleNeedsMembers(circle: CircleListItem): boolean {
  return !circle.isYours && circle.memberCount < 4;
}

export function discoverBadgeEmoji(
  circle: CircleListItem,
  opts: { recommended?: boolean; active?: boolean },
): string | null {
  if (opts.recommended) return "⭐";
  if (opts.active || isHighActivity(circle)) return "🔥";
  if (circleNeedsMembers(circle)) return "🤝";
  return null;
}

function parseRecurringTimePublic(recurringTime: string): { day: string; hour: number; minute: number } | null {
  const m = recurringTime.trim().match(TIME_RE);
  if (!m) return null;
  return { day: m[1], hour: parseInt(m[2], 10), minute: parseInt(m[3], 10) };
}

function formatTime24(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isTomorrowDate(d: Date): boolean {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export function formatCompactSchedule(circle: CircleListItem): string {
  if (circle.nextSessionAt) {
    const d = new Date(circle.nextSessionAt);
    if (!Number.isNaN(d.getTime())) {
      if (isTomorrowDate(d)) return "Tomorrow";
      const day = d.toLocaleDateString("en-US", { weekday: "short" });
      return `${day} ${formatTime24(d.getHours(), d.getMinutes())}`;
    }
  }
  const parsed = parseRecurringTimePublic(circle.recurringTime);
  if (parsed) return `${parsed.day} ${formatTime24(parsed.hour, parsed.minute)}`;
  return circle.recurringTime.trim() || "—";
}

export function formatCompactLocation(circle: CircleListItem): string {
  return formatDiscoverCardLocation({
    meetingPlace: circle.meetingPlace,
    cityName: circle.cityName,
    city: circle.city,
    countryCode: circle.countryCode,
  });
}

export function formatParticipantsLabel(circle: CircleListItem): string {
  const state = circleParticipationState(circle.memberCount, circle.maxSize);
  if (state.isFull) return "Confirmed";
  if (state.peopleInLine && state.spotsLeftLine) {
    return `${state.peopleInLine} · ${state.spotsLeftLine}`;
  }
  return state.peopleInLine ?? state.spotsLeftLine ?? "";
}

export function formatOptionalDescription(
  circle: CircleListItem,
  subtypeLabel?: string | null,
): string | null {
  if (subtypeLabel?.trim() && subtypeLabel !== "—") return subtypeLabel.trim();
  const raw = circle.ritualSubtype?.trim();
  if (!raw) return null;
  return raw.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function formatCompactInfo(circle: CircleListItem): string {
  const state = circleParticipationState(circle.memberCount, circle.maxSize);
  const people = state.isFull
    ? "Confirmed"
    : state.peopleInLine ?? state.spotsLeftLine ?? formatParticipantsLabel(circle);
  return `${people} · ${formatCompactSchedule(circle)}`;
}

export type DiscoverFilters = {
  query: string;
  hobbySlug: string;
  level: DiscoverLevelFilter;
  time: DiscoverTimeFilter;
  size: DiscoverSizeFilter;
  /** YYYY-MM-DD — circles that meet on this calendar day */
  meetDateIso?: string;
};

export type InterestCategoryId = "" | "sports" | "arts" | "games" | "learning" | "social";

const INTEREST_CATEGORY_IDS = new Set<string>(["sports", "arts", "games", "learning", "social"]);

const INTEREST_CATEGORY_DEFS: {
  id: Exclude<InterestCategoryId, "">;
  icon: string;
  keywords: string[];
}[] = [
  {
    id: "sports",
    icon: "🏃",
    keywords: [
      "tennis",
      "padel",
      "soccer",
      "football",
      "basketball",
      "running",
      "sport",
      "golf",
      "yoga",
      "fitness",
      "gym",
      "hiking",
      "cycling",
      "swim",
      "volleyball",
      "badminton",
    ],
  },
  {
    id: "arts",
    icon: "🎨",
    keywords: ["art", "paint", "music", "photo", "craft", "draw", "dance", "theater", "film", "creative"],
  },
  {
    id: "games",
    icon: "🎮",
    keywords: ["chess", "board", "game", "poker", "dnd", "video", "gaming", "go", "backgammon"],
  },
  {
    id: "learning",
    icon: "📚",
    keywords: ["book", "read", "study", "language", "learn", "coding", "programming", "course", "writing"],
  },
  {
    id: "social",
    icon: "☕",
    keywords: ["coffee", "social", "meet", "walk", "brunch", "dinner", "tea", "talk", "network"],
  },
];

export const INTEREST_CATEGORIES = INTEREST_CATEGORY_DEFS.map((d) => ({
  ...d,
  label: d.id.charAt(0).toUpperCase() + d.id.slice(1),
}));

export function getInterestCategories(t: (key: string) => string) {
  return INTEREST_CATEGORY_DEFS.map((d) => ({
    ...d,
    label: t(`interestCategories.${d.id}`),
  }));
}

function circleInterestBlob(circle: CircleListItem): string {
  return [circle.ritualType, circle.hobyDisplayName, circle.ritualSubtype]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function circleMatchesInterestByKeywords(circle: CircleListItem, categoryId: InterestCategoryId): boolean {
  const cat = INTEREST_CATEGORY_DEFS.find((c) => c.id === categoryId);
  if (!cat) return true;
  const blob = circleInterestBlob(circle);
  return cat.keywords.some((kw) => blob.includes(kw));
}

export type HobyInterestLookup = Map<string, InterestCategoryId>;

export function buildHobyInterestLookup(hobies: Hoby[]): HobyInterestLookup {
  const map: HobyInterestLookup = new Map();
  for (const h of hobies) {
    const raw = h.interestCategory?.trim().toLowerCase();
    if (raw && INTEREST_CATEGORY_IDS.has(raw)) {
      map.set(norm(h.slug), raw as Exclude<InterestCategoryId, "">);
    }
  }
  return map;
}

export function interestCategoryForCircle(
  circle: CircleListItem,
  lookup?: HobyInterestLookup,
): InterestCategoryId | null {
  if (!lookup?.size) return null;
  return lookup.get(norm(circle.ritualType)) ?? null;
}

export function circleMatchesInterestCategory(
  circle: CircleListItem,
  categoryId: InterestCategoryId,
  hobies?: Hoby[] | HobyInterestLookup,
): boolean {
  if (!categoryId) return true;

  const lookup =
    hobies instanceof Map ? hobies : hobies?.length ? buildHobyInterestLookup(hobies) : undefined;
  const dbCat = interestCategoryForCircle(circle, lookup);
  if (dbCat) return dbCat === categoryId;

  return circleMatchesInterestByKeywords(circle, categoryId);
}

export function userHasLocationData(userCity: string | null | undefined): boolean {
  return Boolean(userCity?.trim());
}

export function getNearYouCircles(
  circles: CircleListItem[],
  userCity: string | null | undefined,
  limit = 6,
): CircleListItem[] {
  if (!userHasLocationData(userCity)) return [];
  return [...circles]
    .filter((c) => !c.isYours && locationClose(c, userCity))
    .sort((a, b) => b.memberCount - a.memberCount || a.ritualType.localeCompare(b.ritualType))
    .slice(0, limit);
}

export function formatDistanceLabel(
  circle: CircleListItem,
  userCity: string | null | undefined,
): string | null {
  if (!userHasLocationData(userCity) || !locationClose(circle, userCity)) return null;
  const place = circle.meetingPlace?.trim();
  if (place) return "Nearby";
  const named = circle.cityName?.trim() || circle.city?.trim();
  if (named) return `In ${named}`;
  return "In your area";
}

export function formatPeopleGoingLabel(circle: CircleListItem): string {
  return formatParticipantsLabel(circle);
}

export function getAllDiscoverCircles(
  circles: CircleListItem[],
  interestCategory: InterestCategoryId = "",
  hobies?: Hoby[] | HobyInterestLookup,
): CircleListItem[] {
  return [...circles]
    .filter((c) => !c.isYours && circleMatchesInterestCategory(c, interestCategory, hobies))
    .sort((a, b) => {
      const ta = a.nextSessionAt ? new Date(a.nextSessionAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.nextSessionAt ? new Date(b.nextSessionAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return (a.hobyDisplayName ?? a.ritualType).localeCompare(b.hobyDisplayName ?? b.ritualType);
    });
}

export function formatMeetDateLabel(dateIso: string): string {
  const p = parseIsoDate(dateIso);
  if (!p) return dateIso;
  const d = new Date(p.year, p.monthIndex, p.day);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const WEEKDAY_TOKEN = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i;

function recurringWeekdays(recurringTime: string): string[] {
  const parts = recurringTime.trim().replace(/,/g, " ").split(/\s+/);
  const days: string[] = [];
  for (const p of parts) {
    if (WEEKDAY_TOKEN.test(p)) {
      days.push(p.charAt(0).toUpperCase() + p.slice(1, 3).toLowerCase());
    }
  }
  return days;
}

export function circleMatchesMeetDate(circle: CircleListItem, dateIso: string): boolean {
  const p = parseIsoDate(dateIso);
  if (!p) return false;

  if (circle.nextSessionAt) {
    const d = new Date(circle.nextSessionAt);
    if (
      !Number.isNaN(d.getTime()) &&
      d.getFullYear() === p.year &&
      d.getMonth() === p.monthIndex &&
      d.getDate() === p.day
    ) {
      return true;
    }
  }

  const targetWd = weekdayFromIsoDate(dateIso);
  const weekdays = recurringWeekdays(circle.recurringTime);
  if (weekdays.length > 0) return weekdays.includes(targetWd);

  const parsed = parseRecurringTime(circle.recurringTime);
  return parsed?.day === targetWd;
}

export function filterCirclesByMeetDate(circles: CircleListItem[], dateIso: string): CircleListItem[] {
  return circles.filter((c) => circleMatchesMeetDate(c, dateIso));
}

export function applyDiscoverFilters(circles: CircleListItem[], filters: DiscoverFilters): CircleListItem[] {
  const q = norm(filters.query);
  return circles.filter((c) => {
    if (filters.hobbySlug && norm(c.ritualType) !== norm(filters.hobbySlug)) return false;

    if (filters.level) {
      const bucket = levelBucket(c.ritualLevel);
      if (bucket !== filters.level) return false;
    }

    if (filters.time) {
      const parsed = parseRecurringTime(c.recurringTime);
      if (!parsed) return false;
      if (filters.time === "weekend" && !WEEKEND_DAYS.has(parsed.day)) return false;
      if (filters.time === "morning" && (parsed.hour < 5 || parsed.hour >= 12)) return false;
      if (filters.time === "evening" && (parsed.hour < 17 || parsed.hour >= 23)) return false;
    }

    if (filters.size === "small" && (c.memberCount < 1 || c.memberCount > 3)) return false;
    if (filters.size === "growing" && (c.memberCount < 4 || c.memberCount > 5)) return false;

    if (filters.meetDateIso && !circleMatchesMeetDate(c, filters.meetDateIso)) return false;

    if (q) {
      const hay = [
        c.hobyDisplayName,
        c.ritualType,
        c.ritualSubtype,
        c.city,
        c.cityName,
        c.meetingPlace,
        levelKeyToString(c.ritualLevel ?? null),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

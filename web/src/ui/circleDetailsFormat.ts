import type { CircleHobyFields } from "./circleDisplay";
import { circleHobyTitle } from "./circleDisplay";
import { formatDiscoverCardLocation } from "../venueCardDisplay";
import type { CostPaymentPayload, GroupSizePayload, Hoby } from "../api/types";
import { dateLocale, weekdayLabelsByGetDay } from "../dateLocale";
import { formatCostPaymentSummary, formatCurrencyAmount } from "./circlePayment";
import { groupSizeStateFromPayload } from "./groupSize";
import { circleHobyTypeLevelLabels } from "./memberHobbyLevel";

import { circleParticipationState, formatPeopleInLine } from "./circleParticipation";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

const TIME_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})$/;

const EN_DOW_TO_GETDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const VIBE_SLUGS = new Set(["chess", "tennis", "bicycle", "coffee", "dancing", "cooking"]);

function localizedDayShort(dayShort: string): string {
  const idx = EN_DOW_TO_GETDAY[dayShort];
  if (idx == null) return dayShort;
  return weekdayLabelsByGetDay("short")[idx] ?? dayShort;
}

function localizedDayLong(dayShort: string, t?: TFn): string {
  const idx = EN_DOW_TO_GETDAY[dayShort];
  if (idx == null) return dayShort;
  const base = new Date(2024, 0, 7 + idx);
  return base.toLocaleDateString(dateLocale(), { weekday: "long" });
}

function parseSchedule(c: CircleHobyFields): { dayShort: string; dayFull: string; time: string } | null {
  const m = c.recurringTime.trim().match(TIME_RE);
  if (!m) return null;
  const dayShort = m[1];
  const hour = m[2].padStart(2, "0");
  return {
    dayShort,
    dayFull: localizedDayLong(dayShort),
    time: `${hour}:${m[3]}`,
  };
}

export function formatCircleLocationShort(c: CircleHobyFields, t?: TFn): string {
  const mp = c.meetingPlace?.trim() ?? "";
  if (c.modality === "online" || /^https?:\/\//i.test(mp)) {
    return t ? t("circleDetails.online") : "Online";
  }
  return formatDiscoverCardLocation({
    meetingPlace: c.meetingPlace,
    cityName: c.cityName,
    city: c.city,
    countryCode: c.countryCode,
  });
}

/** Legacy schedule line — kept for other screens. */
export function formatCircleScheduleShort(c: CircleHobyFields, t?: TFn): string {
  const parsed = parseSchedule(c);
  if (c.isRecurring === false) {
    if (parsed) {
      const day = localizedDayShort(parsed.dayShort);
      return t
        ? t("circleDetails.scheduleOneTime", { day, time: parsed.time })
        : `${parsed.dayShort} at ${parsed.time} · One-time`;
    }
    return c.recurringTime.trim() || "—";
  }
  if (parsed) {
    const day = localizedDayShort(parsed.dayShort);
    return t ? t("circleDetails.scheduleWeekly", { day, time: parsed.time }) : `Every ${parsed.dayShort} · ${parsed.time}`;
  }
  return c.recurringTime.trim() || "—";
}

export function formatCircleDetailsTitle(
  circle: CircleHobyFields,
  catalogue?: Hoby,
  t?: TFn,
): string {
  const icon = circle.hobyIcon?.trim() ? `${circle.hobyIcon.trim()} ` : "";
  const name = circleHobyTitle(circle);
  const typeLevel = catalogue ? circleHobyTypeLevelLabels(circle, catalogue) : null;
  const level = typeLevel && typeLevel.level !== "—" ? typeLevel.level : null;
  if (t) {
    return level
      ? t("circleDetails.titleWithLevel", { icon, level, name })
      : t("circleDetails.title", { icon, name });
  }
  if (level) return `${icon}${level} ${name} Circle`.trim();
  return `${icon}${name} Circle`.trim();
}

export function formatCircleDetailsRhythm(c: CircleHobyFields, t?: TFn): string {
  if (c.isRecurring === false) return t ? t("circleDetails.oneTimeMeetup") : "One-time meetup";
  const parsed = parseSchedule(c);
  if (parsed) {
    const day = localizedDayLong(parsed.dayShort, t);
    return t ? t("circleDetails.everyWeekday", { day }) : `Play together every ${parsed.dayFull}`;
  }
  return t ? t("circleDetails.weeklyMeetups") : "Weekly meetups";
}

export function formatCircleDetailsVibe(ritualType: string, t?: TFn): string {
  const slug = ritualType.trim().toLowerCase().replace(/-/g, "_");
  if (t) {
    const key = VIBE_SLUGS.has(slug) ? `circleDetails.vibe${slug.charAt(0).toUpperCase()}${slug.slice(1)}` : null;
    if (key) {
      const translated = t(key);
      if (translated !== key) return translated;
    }
    return t("circleDetails.vibeDefault");
  }
  const VIBE_BY_HOBY: Record<string, string> = {
    chess: "Casual games. No pressure. Meet new people.",
    tennis: "Friendly rallies. All welcome.",
    bicycle: "Easy rides. Good company.",
    coffee: "Relaxed chats. Come as you are.",
    dancing: "Move together. No judgment.",
    cooking: "Cook, eat, connect.",
  };
  return VIBE_BY_HOBY[slug] ?? "Relaxed hangouts. Come as you are.";
}

export function formatCircleScheduleChip(c: CircleHobyFields, t?: TFn): string {
  const parsed = parseSchedule(c);
  if (!parsed) return c.recurringTime.trim() || (t ? t("circleDetails.timeTbd") : "Time TBD");
  const day = localizedDayShort(parsed.dayShort);
  if (c.isRecurring === false) {
    return t
      ? t("circleDetails.scheduleOneTime", { day, time: parsed.time })
      : `${parsed.dayShort} at ${parsed.time} · One-time`;
  }
  return t ? t("circleDetails.scheduleWeekly", { day, time: parsed.time }) : `Every ${parsed.dayShort} · ${parsed.time}`;
}

export function formatCircleLocationChip(c: CircleHobyFields, t?: TFn): string {
  if (c.modality === "online") return t ? t("circleDetails.online") : "Online";
  const city = c.cityName?.trim() || c.city?.trim();
  if (city) return city.split(",")[0].trim();
  const full = formatCircleLocationShort(c, t);
  return full.split(",")[0].trim() || (t ? t("circleDetails.locationTbd") : "Location TBD");
}

export function formatCircleCostChip(
  costPayment: CostPaymentPayload | null | undefined,
  groupSize: GroupSizePayload | null | undefined,
  t?: TFn,
): string {
  if (!costPayment || costPayment.type === "free") return t ? t("circleDetails.free") : "Free";
  if (costPayment.type === "per_person" && costPayment.pricePerPerson != null) {
    const amount = formatCurrencyAmount(costPayment.pricePerPerson, costPayment.currency);
    return t ? t("circleDetails.perPerson", { amount }) : `${amount}/person`;
  }
  if (costPayment.type === "split" && costPayment.totalCost != null) {
    const amount = formatCurrencyAmount(costPayment.totalCost, costPayment.currency);
    return t ? t("circleDetails.splitCost", { amount }) : `Split ${amount}`;
  }
  return t ? t("circleDetails.paid") : "Paid";
}

export function formatCircleSizeChip(memberCount: number, maxSize: number, t?: TFn): string {
  const state = circleParticipationState(memberCount, maxSize);
  if (state.isFull) return t ? t("circleDetails.full") : "Full";
  if (t) {
    const joined = Math.max(0, memberCount);
    const capacity = Math.max(1, maxSize);
    const spotsLeft = capacity - joined;
    if (spotsLeft <= 0) return t("circleDetails.full");
    if (spotsLeft === 1) return t("home.oneSpotLeft").replace(/^\(+|\)+$/g, "");
    return t("home.spotsLeft", { count: spotsLeft }).replace(/^\(+|\)+$/g, "");
  }
  if (state.spotsLeftLine) {
    return state.spotsLeftLine.replace(/^\(+|\)+$/g, "");
  }
  return `${Math.max(1, maxSize)} spots total`;
}

export function formatCircleSpotsLeftHint(memberCount: number, maxSize: number): string | null {
  return circleParticipationState(memberCount, maxSize).spotsLeftLine;
}

export function formatCircleMembersJoinedLine(memberCount: number): string | null {
  return formatPeopleInLine(memberCount);
}

export function formatCircleSpotsHint(memberCount: number, maxSize: number, t?: TFn): string {
  const state = circleParticipationState(memberCount, maxSize);
  if (state.isFull) {
    return t
      ? t("discoverPage.circleFull", { count: state.joined, max: state.capacity })
      : `Full (${state.joined}/${state.capacity})`;
  }
  if (t) {
    const joined = Math.max(0, memberCount);
    const capacity = Math.max(1, maxSize);
    const spotsLeft = capacity - joined;
    const peopleInLine = joined <= 1 ? null : t("home.peopleIn", { count: joined });
    const spotsLeftLine =
      spotsLeft <= 0
        ? null
        : spotsLeft === 1
          ? t("home.oneSpotLeft")
          : t("home.spotsLeft", { count: spotsLeft });
    if (peopleInLine && spotsLeftLine) return `${peopleInLine} · ${spotsLeftLine}`;
    return peopleInLine ?? spotsLeftLine ?? "";
  }
  if (state.peopleInLine && state.spotsLeftLine) {
    return `${state.peopleInLine} · ${state.spotsLeftLine}`;
  }
  return state.peopleInLine ?? state.spotsLeftLine ?? "";
}

export function formatCircleSocialContext(memberCount: number, maxSize: number, t?: TFn): string {
  return formatCircleSpotsHint(memberCount, maxSize, t);
}

export function formatSeeMeetupCta(iso: string | null | undefined): string {
  if (!iso) return "👉 See next meetup";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "👉 See next meetup";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (dayDiff === 0) return "👉 See today's meetup";
  if (dayDiff === 1) return "👉 See tomorrow's meetup";
  return "👉 See next meetup";
}

export function formatCircleCostPayment(
  costPayment: CostPaymentPayload | null | undefined,
  groupSize: GroupSizePayload | null | undefined,
): string {
  if (!costPayment) return "Free";
  const full = formatCostPaymentSummary(costPayment, groupSizeStateFromPayload(groupSize));
  if (full.startsWith("Free")) return "Free";
  return full;
}

export function formatNextMeetingUrgency(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (dayDiff < 0) return null;
  if (dayDiff === 0) return "Next meeting today";
  if (dayDiff === 1) return "Next meeting tomorrow";
  return `Next meeting in ${dayDiff} days`;
}

export function humanMemberLevelPhrase(rawLabel: string, t?: TFn): string {
  if (/[\u0590-\u05FF]/.test(rawLabel)) return rawLabel;
  const l = rawLabel.toLowerCase();
  if (l === "level not set" || l === "—") return t ? t("circleDetails.levelNew") : "New to this";
  if (l.includes("begin")) return t ? t("circleDetails.levelGettingStarted") : "Just getting started";
  if (l.includes("inter")) return t ? t("circleDetails.levelComfortable") : "Getting comfortable";
  if (l.includes("advanc") || l.includes("pro") || l.includes("master") || l.includes("expert")) {
    return t ? t("circleDetails.levelExperienced") : "Experienced";
  }
  return rawLabel;
}

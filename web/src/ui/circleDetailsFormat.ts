import type { CircleHobyFields } from "./circleDisplay";
import { circleHobyTitle } from "./circleDisplay";
import { formatDiscoverCardLocation } from "../venueCardDisplay";
import type { CostPaymentPayload, GroupSizePayload, Hoby } from "../api/types";
import { formatCostPaymentSummary, formatCurrencyAmount } from "./circlePayment";
import { groupSizeStateFromPayload } from "./groupSize";
import { circleHobyTypeLevelLabels } from "./memberHobbyLevel";

import { circleParticipationState, formatPeopleInLine } from "./circleParticipation";

const DAY_FULL: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

const TIME_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})$/;

const VIBE_BY_HOBY: Record<string, string> = {
  chess: "Casual games. No pressure. Meet new people.",
  tennis: "Friendly rallies. All welcome.",
  bicycle: "Easy rides. Good company.",
  coffee: "Relaxed chats. Come as you are.",
  dancing: "Move together. No judgment.",
  cooking: "Cook, eat, connect.",
};

function parseSchedule(c: CircleHobyFields): { dayShort: string; dayFull: string; time: string } | null {
  const m = c.recurringTime.trim().match(TIME_RE);
  if (!m) return null;
  const dayShort = m[1];
  const hour = m[2].padStart(2, "0");
  return {
    dayShort,
    dayFull: DAY_FULL[dayShort] ?? dayShort,
    time: `${hour}:${m[3]}`,
  };
}

export function formatCircleLocationShort(c: CircleHobyFields): string {
  const mp = c.meetingPlace?.trim() ?? "";
  if (c.modality === "online" || /^https?:\/\//i.test(mp)) return "Online";
  return formatDiscoverCardLocation({
    meetingPlace: c.meetingPlace,
    cityName: c.cityName,
    city: c.city,
    countryCode: c.countryCode,
  });
}

/** Legacy schedule line — kept for other screens. */
export function formatCircleScheduleShort(c: CircleHobyFields): string {
  const parsed = parseSchedule(c);
  if (c.isRecurring === false) {
    if (parsed) return `${parsed.dayShort} at ${parsed.time} · One-time`;
    return c.recurringTime.trim() || "—";
  }
  if (parsed) return `Every ${parsed.dayShort} · ${parsed.time}`;
  return c.recurringTime.trim() || "—";
}

export function formatCircleDetailsTitle(
  circle: CircleHobyFields,
  catalogue?: Hoby,
): string {
  const icon = circle.hobyIcon?.trim() ? `${circle.hobyIcon.trim()} ` : "";
  const name = circleHobyTitle(circle);
  const typeLevel = catalogue ? circleHobyTypeLevelLabels(circle, catalogue) : null;
  const level =
    typeLevel && typeLevel.level !== "—" ? typeLevel.level : null;
  if (level) return `${icon}${level} ${name} Circle`.trim();
  return `${icon}${name} Circle`.trim();
}

export function formatCircleDetailsRhythm(c: CircleHobyFields): string {
  if (c.isRecurring === false) return "One-time meetup";
  const parsed = parseSchedule(c);
  if (parsed) return `Play together every ${parsed.dayFull}`;
  return "Weekly meetups";
}

export function formatCircleDetailsVibe(ritualType: string): string {
  const slug = ritualType.trim().toLowerCase().replace(/-/g, "_");
  return VIBE_BY_HOBY[slug] ?? "Relaxed hangouts. Come as you are.";
}

export function formatCircleScheduleChip(c: CircleHobyFields): string {
  const parsed = parseSchedule(c);
  if (!parsed) return c.recurringTime.trim() || "Time TBD";
  if (c.isRecurring === false) return `${parsed.dayShort} at ${parsed.time} · One-time`;
  return `Every ${parsed.dayShort} · ${parsed.time}`;
}

export function formatCircleLocationChip(c: CircleHobyFields): string {
  if (c.modality === "online") return "Online";
  const city = c.cityName?.trim() || c.city?.trim();
  if (city) return city.split(",")[0].trim();
  const full = formatCircleLocationShort(c);
  return full.split(",")[0].trim() || "Location TBD";
}

export function formatCircleCostChip(
  costPayment: CostPaymentPayload | null | undefined,
  groupSize: GroupSizePayload | null | undefined,
): string {
  if (!costPayment || costPayment.type === "free") return "Free";
  if (costPayment.type === "per_person" && costPayment.pricePerPerson != null) {
    return `${formatCurrencyAmount(costPayment.pricePerPerson, costPayment.currency)}/person`;
  }
  if (costPayment.type === "split" && costPayment.totalCost != null) {
    return `Split ${formatCurrencyAmount(costPayment.totalCost, costPayment.currency)}`;
  }
  return "Paid";
}

export function formatCircleSizeChip(memberCount: number, maxSize: number): string {
  const state = circleParticipationState(memberCount, maxSize);
  if (state.isFull) return "Full";
  if (state.spotsLeftLine) {
    const inner = state.spotsLeftLine.replace(/^\(+|\)+$/g, "");
    return inner;
  }
  return `${Math.max(1, maxSize)} spots total`;
}

export function formatCircleSpotsLeftHint(memberCount: number, maxSize: number): string | null {
  return circleParticipationState(memberCount, maxSize).spotsLeftLine;
}

export function formatCircleMembersJoinedLine(memberCount: number): string | null {
  return formatPeopleInLine(memberCount);
}

export function formatCircleSpotsHint(memberCount: number, maxSize: number): string {
  const state = circleParticipationState(memberCount, maxSize);
  if (state.isFull) return "Confirmed";
  if (state.peopleInLine && state.spotsLeftLine) {
    return `${state.peopleInLine} · ${state.spotsLeftLine}`;
  }
  return state.peopleInLine ?? state.spotsLeftLine ?? "";
}

export function formatCircleSocialContext(memberCount: number, maxSize: number): string {
  return formatCircleSpotsHint(memberCount, maxSize);
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

export function humanMemberLevelPhrase(rawLabel: string): string {
  const l = rawLabel.toLowerCase();
  if (l === "level not set" || l === "—") return "New to this";
  if (l.includes("begin")) return "Just getting started";
  if (l.includes("inter")) return "Getting comfortable";
  if (l.includes("advanc") || l.includes("pro") || l.includes("master") || l.includes("expert")) {
    return "Experienced";
  }
  return rawLabel;
}

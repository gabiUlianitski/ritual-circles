import type { Activity, ActivityCreatePayload } from "../api/types";
import { COST_CURRENCIES, type CostCurrency } from "./circlePayment";
import { snapTimeValue } from "./quarterHourTime";

export const ACTIVITY_CURRENCIES: { code: CostCurrency | "CHF"; label: string }[] = [
  ...COST_CURRENCIES,
  { code: "CHF", label: "CHF (Fr.)" },
];

/** English weekday codes, same shape as a circle's recurringTime ("Sat 10:00"). */
export const WEEKDAY_CODES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export type ActivityIssueCode =
  | "title"
  | "date"
  | "end"
  | "groupSize"
  | "minParticipants"
  | "amount"
  | "currency";

export type ActivityDraft = {
  title: string;
  description: string;
  when: "one_time" | "recurring";
  date: string;
  startTime: string;
  endTime: string;
  weekday: WeekdayCode;
  locationName: string;
  locationAddress: string;
  groupSize: number | null;
  minParticipants: number | null;
  cost: "free" | "paid";
  amount: string;
  currency: string;
};

export function localDateTimeIso(dateIso: string, timeHm: string): string | null {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = timeHm.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

const JS_DAY: Record<WeekdayCode, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Next local occurrence of a weekday and time. Not a series of sessions. */
export function nextWeeklyStartIso(day: WeekdayCode, timeHm: string): string | null {
  const [hh, mm] = timeHm.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  const delta = (JS_DAY[day] - candidate.getDay() + 7) % 7;
  candidate.setDate(candidate.getDate() + delta);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 7);
  return candidate.toISOString();
}

export function recurrenceRule(day: WeekdayCode, timeHm: string): string {
  return `${day} ${timeHm}`;
}

export function parsePrice(raw: string): string | null {
  const text = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Number(text).toFixed(2);
}

export function activityIssues(draft: ActivityDraft): ActivityIssueCode[] {
  const issues: ActivityIssueCode[] = [];
  if (!draft.title.trim()) issues.push("title");
  if (draft.when === "one_time") {
    const start = localDateTimeIso(draft.date, draft.startTime);
    if (!draft.date.trim() || !start) issues.push("date");
    if (draft.endTime.trim()) {
      const end = localDateTimeIso(draft.date, draft.endTime);
      if (!start || !end || end <= start) issues.push("end");
    }
  }
  if (draft.groupSize == null || !Number.isInteger(draft.groupSize) || draft.groupSize <= 0) {
    issues.push("groupSize");
  }
  if (
    draft.minParticipants == null ||
    !Number.isInteger(draft.minParticipants) ||
    draft.minParticipants <= 0 ||
    (draft.groupSize != null && draft.minParticipants > draft.groupSize)
  ) {
    issues.push("minParticipants");
  }
  if (draft.cost === "paid") {
    if (parsePrice(draft.amount) == null) issues.push("amount");
    if (!/^[A-Za-z]{3}$/.test(draft.currency.trim())) issues.push("currency");
  }
  return issues;
}

export function parsedWeeklyRule(
  rule: string | null | undefined,
): { weekday: WeekdayCode; time: string } | null {
  if (!rule) return null;
  const match = rule.trim().match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}:\d{2})$/);
  if (!match) return null;
  const time = snapTimeValue(match[2]);
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  return { weekday: match[1] as WeekdayCode, time };
}

function localWeekday(date: Date): WeekdayCode {
  return (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const)[date.getDay()];
}

function localHm(date: Date): string {
  return snapTimeValue(
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  );
}

function amountInput(value: Activity["priceAmount"]): string {
  if (value == null || value === "") return "";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/** Form values from the activity itself. Circle defaults are not applied. */
export function draftFromActivity(activity: Activity): ActivityDraft {
  const start = new Date(activity.startAt);
  const valid = !Number.isNaN(start.getTime());
  const date = valid
    ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`
    : "";
  const startTime = valid ? localHm(start) : "10:00";
  let endTime = "";
  if (activity.endAt) {
    const end = new Date(activity.endAt);
    if (!Number.isNaN(end.getTime())) endTime = localHm(end);
  }
  const weekly = activity.recurrenceType === "recurring" ? parsedWeeklyRule(activity.recurrenceRule) : null;
  const currency = activity.currency?.trim().toUpperCase() ?? "";
  return {
    title: activity.title ?? "",
    description: activity.description ?? "",
    when: activity.recurrenceType === "recurring" ? "recurring" : "one_time",
    date,
    startTime: weekly?.time ?? startTime,
    endTime: activity.recurrenceType === "recurring" ? "" : endTime,
    weekday: weekly?.weekday ?? weekdayCodeFromDate(date),
    locationName: activity.locationName ?? "",
    locationAddress: activity.locationAddress ?? "",
    groupSize: Number.isInteger(activity.groupSize) && activity.groupSize > 0 ? activity.groupSize : null,
    minParticipants:
      Number.isInteger(activity.minParticipants) && activity.minParticipants > 0
        ? activity.minParticipants
        : activity.groupSize,
    cost: activity.paymentType === "paid" ? "paid" : "free",
    amount: activity.paymentType === "paid" ? amountInput(activity.priceAmount) : "",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : COST_CURRENCIES[0].code,
  };
}

export function activityPayload(
  draft: ActivityDraft,
  options?: { keepStartAt?: string | null },
): ActivityCreatePayload | null {
  if (activityIssues(draft).length > 0) return null;
  const groupSize = draft.groupSize as number;
  const minParticipants = draft.minParticipants as number;
  let startAt =
    draft.when === "recurring"
      ? nextWeeklyStartIso(draft.weekday, draft.startTime)
      : localDateTimeIso(draft.date, draft.startTime);
  if (draft.when === "recurring" && options?.keepStartAt) {
    const existing = new Date(options.keepStartAt);
    if (
      !Number.isNaN(existing.getTime()) &&
      localWeekday(existing) === draft.weekday &&
      localHm(existing) === snapTimeValue(draft.startTime)
    ) {
      startAt = options.keepStartAt;
    }
  }
  if (!startAt) return null;
  const endAt =
    draft.when === "one_time" && draft.endTime.trim()
      ? localDateTimeIso(draft.date, draft.endTime)
      : null;
  const price = draft.cost === "paid" ? parsePrice(draft.amount) : null;
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    startAt,
    endAt,
    recurrenceType: draft.when,
    recurrenceRule: draft.when === "recurring" ? recurrenceRule(draft.weekday, draft.startTime) : null,
    locationName: draft.locationName.trim() || null,
    locationAddress: draft.locationAddress.trim() || null,
    groupSize,
    minParticipants,
    paymentType: draft.cost,
    priceAmount: price,
    currency: draft.cost === "paid" ? draft.currency.trim().toUpperCase() : null,
  };
}

export function weekdayCodeFromDate(dateIso: string): WeekdayCode {
  const [y, m, d] = dateIso.split("-").map(Number);
  if (!y || !m || !d) return "Sat";
  const js = new Date(y, m - 1, d).getDay();
  return (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const)[js];
}

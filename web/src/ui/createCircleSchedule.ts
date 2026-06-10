import { defaultMeetDateIso, todayIsoLocal } from "./calendarMonth";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type MeetWeekdayLabel = (typeof DOW_LABELS)[number];

const DOW_FULL: Record<MeetWeekdayLabel, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export { defaultMeetDateIso, todayIsoLocal };
export function weekdayFromIsoDate(iso: string): MeetWeekdayLabel {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return "Tue";
  const js = new Date(y, m - 1, day).getDay();
  return DOW_LABELS[(js + 6) % 7];
}

export function hourToHm(hour: string): string {
  const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
  return `${String(h).padStart(2, "0")}:00`;
}

export function recurringFromDateAndHour(dateIso: string, hour: string): string {
  const day = weekdayFromIsoDate(dateIso);
  return `${day} ${hourToHm(hour)}`;
}

export function buildFirstSessionIso(dateIso: string, hour: string): string {
  const [y, m, day] = dateIso.split("-").map(Number);
  const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
  return new Date(y, m - 1, day, h, 0, 0, 0).toISOString();
}

export function formatMeetDateLong(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatScheduleSummary(
  meetDate: string,
  meetHour: string,
  repeatsWeekly: boolean,
  formatHour: (hour: string) => string,
): string {
  if (!meetDate || meetHour === "") return "";
  const wd = weekdayFromIsoDate(meetDate);
  const timeLabel = formatHour(meetHour);
  if (repeatsWeekly) return `Every ${DOW_FULL[wd]} at ${timeLabel}`;
  return `${formatMeetDateLong(meetDate)} at ${timeLabel}`;
}

export function isMeetDateOnOrAfterToday(dateIso: string): boolean {
  return dateIso >= todayIsoLocal();
}

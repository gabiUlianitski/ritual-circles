/** 15 minutes — fallback `step` when a native time input is still used. */
export const QUARTER_HOUR_STEP_SEC = 900;

export const QUARTER_MINUTES = ["00", "15", "30", "45"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Snap clock minutes to nearest quarter (00, 15, 30, 45). */
export function snapHourMinute(hour: number, minute: number): { hour: number; minute: number } {
  let h = hour;
  let m = minute;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { hour: 18, minute: 0 };
  const rounded = Math.round(m / 15) * 15;
  if (rounded === 60) {
    h = (h + 1) % 24;
    m = 0;
  } else {
    m = rounded;
  }
  return { hour: h, minute: m };
}

/** `datetime-local` value → quarter-hour snapped `YYYY-MM-DDTHH:mm`. */
export function snapDatetimeLocalValue(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const [, date, hStr, mStr] = match;
  const { hour, minute } = snapHourMinute(Number.parseInt(hStr, 10), Number.parseInt(mStr, 10));
  return `${date}T${pad2(hour)}:${pad2(minute)}`;
}

/** `time` input value → quarter-hour snapped `HH:mm`. */
export function snapTimeValue(value: string): string {
  const trimmed = value.trim().slice(0, 5);
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const { hour, minute } = snapHourMinute(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function parseTimeHm(value: string): { hour: string; minute: string } {
  const snapped = snapTimeValue(value || "18:00");
  const [hour = "18", minute = "00"] = snapped.split(":");
  const m = QUARTER_MINUTES.includes(minute as (typeof QUARTER_MINUTES)[number]) ? minute : "00";
  return { hour, minute: m };
}

export function buildTimeHm(hour: string, minute: string): string {
  return snapTimeValue(`${hour}:${minute}`);
}

export function splitDatetimeLocal(value: string): { date: string; time: string } {
  const [date = "", rest = ""] = value.trim().split("T");
  const time = snapTimeValue(rest.slice(0, 5) || "18:00");
  return { date, time };
}

export function mergeDatetimeLocal(date: string, time: string): string {
  if (!date.trim()) return "";
  return snapDatetimeLocalValue(`${date.trim()}T${snapTimeValue(time)}`);
}

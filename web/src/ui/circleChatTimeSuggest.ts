import { snapHourMinute } from "./quarterHourTime";

/** Machine-readable prefix for meeting-time suggestions in circle chat. */
const TIME_SUGGEST_PREFIX = "[TIME_SUGGEST]";

export function buildTimeSuggestMessage(when: Date): string {
  return `${TIME_SUGGEST_PREFIX}${when.toISOString()}`;
}

export function parseTimeSuggestMessage(body: string): { when: Date; label: string } | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith(TIME_SUGGEST_PREFIX)) return null;
  const iso = trimmed.slice(TIME_SUGGEST_PREFIX.length).trim();
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return {
    when,
    label: when.toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

/** Value for `<input type="date" />` (YYYY-MM-DD). */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Value for `<input type="time" />` (HH:mm), snapped to quarter hours. */
export function toTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const { hour, minute } = snapHourMinute(d.getHours(), d.getMinutes());
  return `${pad(hour)}:${pad(minute)}`;
}

export function dateAndTimeToDate(date: string, time: string): Date | null {
  if (!date.trim() || !time.trim()) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Open native date/time picker when supported (Chrome, Safari, Edge). */
export function openNativePicker(input: HTMLInputElement | null): void {
  if (!input) return;
  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  } else {
    input.focus();
  }
}

/** Default suggestion: next hour on a quarter hour. */
export function defaultSuggestDate(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  const { hour, minute } = snapHourMinute(d.getHours(), d.getMinutes());
  d.setHours(hour, minute, 0, 0);
  return d;
}

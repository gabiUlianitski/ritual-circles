/** Prefix of retired meeting-time suggestions. Old messages still render read-only. */
const TIME_SUGGEST_PREFIX = "[TIME_SUGGEST]";

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

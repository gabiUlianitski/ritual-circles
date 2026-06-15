import { getAppLanguageCode } from "./i18n";

export function dateLocale(): string | undefined {
  return getAppLanguageCode() === "he" ? "he-IL" : undefined;
}

/** Sunday = index 0, matching Date.getDay(). */
export function weekdayLabelsByGetDay(style: "short" | "narrow" = "short"): string[] {
  const locale = dateLocale();
  const base = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const label = d.toLocaleDateString(locale, { weekday: style });
    if (!locale && style === "short") return label.slice(0, 3);
    return label;
  });
}

/** Shared circle card lines: hoby, type/level, city, schedule. */

import type { Hoby } from "../api/types";
import { circleHobyTypeLevelLabels, findHobyCatalogue } from "./memberHobbyLevel";

export type CircleHobyFields = {
  ritualType: string;
  recurringTime: string;
  isRecurring?: boolean;
  modality?: "online" | "offline" | string;
  city?: string | null;
  countryCode?: string | null;
  cityName?: string | null;
  meetingPlace?: string | null;
  hobyDisplayName?: string | null;
  hobyIcon?: string | null;
  ritualSubtype?: string | null;
  ritualLevel?: string | number | null;
};

export function circleHobyTitle(c: CircleHobyFields): string {
  return c.hobyDisplayName?.trim() || c.ritualType;
}

export function circleTypeLevelLine(c: CircleHobyFields, catalogue?: Hoby): string {
  if (catalogue) {
    const { type, level } = circleHobyTypeLevelLabels(c, catalogue);
    return `Type: ${type} • Level: ${level}`;
  }
  const type = c.ritualSubtype?.trim() ? c.ritualSubtype.replace(/_/g, " ") : "—";
  const level =
    c.ritualLevel != null
      ? String(c.ritualLevel).replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())
      : "—";
  return `Type: ${type} • Level: ${level}`;
}

export function circleCityLine(c: CircleHobyFields): string {
  const named = [c.cityName?.trim(), c.countryCode?.trim()].filter(Boolean).join(", ");
  if (named) return `City: ${named}`;
  const place = c.meetingPlace?.trim();
  if (place) return `City: ${place}`;
  const city = c.city?.trim();
  if (city) return `City: ${city}`;
  return "City: —";
}

export function circleScheduleLine(c: CircleHobyFields): string {
  if (c.isRecurring === false) return `Schedule: Once · ${c.recurringTime}`;
  return `Schedule: Weekly ${c.recurringTime}`;
}

/** Standard 4-line body for circle list cards. */
export function CircleCardLines(props: {
  c: CircleHobyFields;
  isYours?: boolean;
  iconSize?: string;
  hobiesCatalog?: Hoby[];
}) {
  const fs = props.iconSize ?? "1.35rem";
  const title = circleHobyTitle(props.c);
  const catalogue = props.hobiesCatalog?.length
    ? findHobyCatalogue(props.hobiesCatalog, props.c.ritualType)
    : undefined;
  return (
    <div className="circle-card-lines">
      <div className="row circle-card-line-hoby" style={{ gap: 10, alignItems: "center" }}>
        {props.c.hobyIcon ? (
          <span style={{ fontSize: fs, lineHeight: 1 }} aria-hidden>
            {props.c.hobyIcon}
          </span>
        ) : null}
        <div style={{ fontWeight: 650 }}>{title}</div>
        {props.isYours ? (
          <span className="circle-mine-mark" title="Your circle" aria-label="Your circle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.8 5.7 21l2.3-7-6-4.6h7.6L12 2z" />
            </svg>
          </span>
        ) : null}
      </div>
      <div className="muted circle-card-line">{circleTypeLevelLine(props.c, catalogue)}</div>
      <div className="muted circle-card-line">{circleCityLine(props.c)}</div>
      <div className="muted circle-card-line">{circleScheduleLine(props.c)}</div>
    </div>
  );
}

export function CircleHobyHeading(props: { c: CircleHobyFields; iconSize?: string }) {
  const fs = props.iconSize ?? "1.35rem";
  return (
    <div className="row" style={{ gap: 10, alignItems: "center" }}>
      {props.c.hobyIcon ? (
        <span style={{ fontSize: fs, lineHeight: 1 }} aria-hidden>
          {props.c.hobyIcon}
        </span>
      ) : null}
      <div style={{ fontWeight: 650 }}>{circleHobyTitle(props.c)}</div>
    </div>
  );
}

/** @deprecated Prefer CircleCardLines for list cards. */
export function CircleScheduleAndTypeLevel(props: { c: CircleHobyFields; hobiesCatalog?: Hoby[] }) {
  return <CircleCardLines c={props.c} hobiesCatalog={props.hobiesCatalog} />;
}

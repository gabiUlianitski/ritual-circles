/** Shared circle card lines: hoby, type/level, city, schedule. */

import type { Hoby } from "../api/types";
import { BidiText } from "./BidiText";
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

export const CIRCLE_NAME_MAX = 80;
export const CIRCLE_DESCRIPTION_MAX = 500;

export type CircleIdentityFields = CircleHobyFields & {
  name?: string | null;
  displayTitle?: string | null;
  hasCustomName?: boolean;
};

export function circleHobyTitle(c: CircleHobyFields): string {
  return c.hobyDisplayName?.trim() || c.ritualType;
}

/** Persisted name, presentation title, and whether the community named itself. */
export function circleIdentity(c: CircleIdentityFields): {
  name: string | null;
  displayTitle: string;
  hasCustomName: boolean;
  hobbyDisplayName: string;
} {
  const hobbyDisplayName = circleHobyTitle(c);
  const stored = c.name?.trim() || "";
  const hasCustomName = typeof c.hasCustomName === "boolean" ? c.hasCustomName : Boolean(stored);
  const fromApi = c.displayTitle?.trim() || "";
  const displayTitle =
    fromApi || (hasCustomName ? stored : "") || hobbyDisplayName || c.ritualType || "Circle";
  return {
    name: stored || null,
    displayTitle,
    hasCustomName,
    hobbyDisplayName,
  };
}

export function circleDisplayTitle(c: CircleIdentityFields): string {
  return circleIdentity(c).displayTitle;
}

/** Hobby label shown under a custom community name. Hidden when the title is already the hobby. */
export function circleHobbySubtitle(c: CircleIdentityFields): string | null {
  const id = circleIdentity(c);
  if (!id.hasCustomName) return null;
  const hobby = id.hobbyDisplayName.trim();
  if (!hobby || hobby === id.displayTitle) return null;
  return hobby;
}

const EMPTY_SUBTITLE_LABEL = "—";

function subtitleLabel(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text || text === EMPTY_SUBTITLE_LABEL) return null;
  return text;
}

/**
 * Discover line under displayTitle.
 * Named circles: hobby, then type, then level.
 * Unnamed circles: type and level only, so the hobby is not repeated under itself.
 * Missing labels are omitted, so the line never starts or ends with a separator.
 */
export function discoverSubtitleParts(circle: CircleIdentityFields, catalogue?: Hoby): string[] {
  const identity = circleIdentity(circle);
  const labels = circleHobyTypeLevelLabels(circle, catalogue);
  const parts: string[] = [];
  const push = (value: string | null) => {
    if (!value || value === identity.displayTitle || parts.includes(value)) return;
    parts.push(value);
  };
  if (identity.hasCustomName) push(subtitleLabel(identity.hobbyDisplayName));
  push(subtitleLabel(labels.type));
  push(subtitleLabel(labels.level));
  return parts;
}

function cleanDescription(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Exact copy of the title, or a custom name repeated at the start
 * ("Sunday Lake Riders is a circle..."). Hobby blurbs that begin with the
 * hobby word stay, because that word is the title only when the circle is unnamed.
 */
function descriptionRepeatsTitle(text: string, title: string, named: boolean): boolean {
  const body = text.trim().toLocaleLowerCase();
  const name = title.trim().toLocaleLowerCase();
  if (!body || !name) return false;
  if (body === name) return true;
  if (!named || name.length < 3 || !body.startsWith(name)) return false;
  const boundary = body.charAt(name.length);
  return /[\s,.:;!?'"()\-–—]/.test(boundary);
}

/**
 * Description under a Discover title.
 * Circle text, then the hobby text, then the existing fallback.
 * A description that only repeats the title is skipped when another description exists.
 */
export function discoverDescription(
  circle: CircleIdentityFields & { description?: string | null },
  catalogue?: { shortDescription?: string | null } | null,
  fallback = "",
): string {
  const identity = circleIdentity(circle);
  const title = identity.displayTitle;
  const circleText = cleanDescription(circle.description);
  const hobbyText = cleanDescription(catalogue?.shortDescription);
  const circleEcho = Boolean(circleText) && descriptionRepeatsTitle(circleText, title, identity.hasCustomName);
  const hobbyEcho = Boolean(hobbyText) && descriptionRepeatsTitle(hobbyText, title, identity.hasCustomName);

  if (circleText && !circleEcho) return circleText;
  if (hobbyText && !hobbyEcho) return hobbyText;
  if (circleText) return circleText;
  if (hobbyText) return hobbyText;
  return cleanDescription(fallback);
}

/** Bidi-isolated subtitle. Each label is its own isolate so the separator stays between them. */
export function DiscoverSubtitle(props: { parts: string[]; className?: string }) {
  if (props.parts.length === 0) return null;
  return (
    <p className={props.className}>
      {props.parts.map((part, index) => (
        <span key={`${index}:${part}`}>
          {index > 0 ? <span aria-hidden> · </span> : null}
          <BidiText>{part}</BidiText>
        </span>
      ))}
    </p>
  );
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
  c: CircleIdentityFields;
  isYours?: boolean;
  iconSize?: string;
  hobiesCatalog?: Hoby[];
}) {
  const fs = props.iconSize ?? "1.35rem";
  const title = circleDisplayTitle(props.c);
  const hobbySubtitle = circleHobbySubtitle(props.c);
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
        <div className="circle-title-wrap" style={{ fontWeight: 650 }}>
          <BidiText>{title}</BidiText>
          {hobbySubtitle ? <div className="muted circle-identity-hobby">{hobbySubtitle}</div> : null}
        </div>
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

export function CircleHobyHeading(props: { c: CircleIdentityFields; iconSize?: string }) {
  const fs = props.iconSize ?? "1.35rem";
  const hobbySubtitle = circleHobbySubtitle(props.c);
  return (
    <div className="row" style={{ gap: 10, alignItems: "center" }}>
      {props.c.hobyIcon ? (
        <span style={{ fontSize: fs, lineHeight: 1 }} aria-hidden>
          {props.c.hobyIcon}
        </span>
      ) : null}
      <div className="circle-title-wrap" style={{ fontWeight: 650 }}>
        <BidiText>{circleDisplayTitle(props.c)}</BidiText>
        {hobbySubtitle ? <div className="muted circle-identity-hobby">{hobbySubtitle}</div> : null}
      </div>
    </div>
  );
}

/** @deprecated Prefer CircleCardLines for list cards. */
export function CircleScheduleAndTypeLevel(props: { c: CircleHobyFields; hobiesCatalog?: Hoby[] }) {
  return <CircleCardLines c={props.c} hobiesCatalog={props.hobiesCatalog} />;
}

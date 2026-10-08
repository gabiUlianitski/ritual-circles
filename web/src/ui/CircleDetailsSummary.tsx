import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleMemberResponse, CostPaymentPayload, GroupSizePayload, Hoby } from "../api/types";
import { BidiText } from "./BidiText";
import { circleIdentity, type CircleHobyFields, type CircleIdentityFields } from "./circleDisplay";
import {
  formatCircleCostChip,
  formatCircleLocationChip,
  formatCircleScheduleChip,
} from "./circleDetailsFormat";
import { circleHobyTypeLevelLabels, findHobyCatalogue } from "./memberHobbyLevel";
import { parseHobyTypesNested } from "./hobyMetadata";
import { memberDisplayName } from "./circleMembers";
import { CircleMemberAvatar } from "./CircleMemberAvatar";

/** Circle description, then the hobby catalogue line, then the shared fallback sentence. */
export function circleSummaryDescription(
  description: string | null | undefined,
  catalogue: Hoby | undefined,
  fallback: string,
): string {
  return (
    description?.trim() ||
    catalogue?.discoveryDescription?.trim() ||
    catalogue?.shortDescription?.trim() ||
    fallback
  );
}

export function CircleDetailsSummary(props: {
  circle: CircleIdentityFields & {
    modality?: string;
    costPayment?: CostPaymentPayload | null;
    groupSize?: GroupSizePayload | null;
    maxSize?: number;
    description?: string | null;
  };
  hobiesCatalog?: Hoby[];
  members?: CircleMemberResponse[];
  myUserId?: string | null;
  memberCount?: number;
  maxSize?: number;
  hasNextSession?: boolean;
  /** Invitation preview shows schedule and place in their own sections. */
  hideFacts?: boolean;
  hideDescription?: boolean;
  hidePeople?: boolean;
  hideStatus?: boolean;
  showEyebrow?: boolean;
}) {
  const { t } = useTranslation();
  const { circle } = props;
  const catalogue = props.hobiesCatalog?.length
    ? findHobyCatalogue(props.hobiesCatalog, circle.ritualType)
    : undefined;

  const identity = circleIdentity(circle);
  const title = identity.displayTitle;
  const typeLevel = catalogue ? circleHobyTypeLevelLabels(circle, catalogue) : null;
  const selectedType = parseHobyTypesNested(catalogue?.types).find(
    (item) => item.key === circle.ritualSubtype?.trim(),
  );
  const level = typeLevel && typeLevel.level !== "—" ? typeLevel.level : null;
  const type = typeLevel && typeLevel.type !== "—" ? typeLevel.type : null;
  const description = circleSummaryDescription(
    circle.description,
    catalogue,
    t("circleDetails.descriptionFallback"),
  );
  const icon = circle.hobyIcon?.trim() || catalogue?.icon?.trim() || "";
  const scheduleChip = formatCircleScheduleChip(circle, t);
  const locationChip = formatCircleLocationChip(circle, t);
  const costChip = formatCircleCostChip(circle.costPayment, circle.groupSize, t);
  const joined = Math.max(0, props.memberCount ?? 0);
  const capacity = Math.max(1, props.maxSize ?? circle.maxSize ?? 6);
  const status =
    joined >= capacity ? "full" : !props.hasNextSession ? "noActivity" : joined >= 3 ? "ready" : "forming";
  const statusKey = {
    full: "circleDetails.statusFull",
    noActivity: "circleDetails.statusNoActivity",
    ready: "circleDetails.statusReady",
    forming: "circleDetails.statusForming",
  }[status];
  const allMembers = props.members ?? [];
  const previewMembers = allMembers.slice(0, 5);
  const showHobbyLine = identity.hasCustomName && identity.hobbyDisplayName !== identity.displayTitle;
  const identityLine = [
    showHobbyLine ? identity.hobbyDisplayName : null,
    type ? `${selectedType?.icon ? `${selectedType.icon} ` : ""}${type}` : null,
    level,
  ].filter((part): part is string => Boolean(part));
  const peopleLine = membersNamesLine(allMembers, props.myUserId ?? null, t);
  const seats = Array.from({ length: capacity }, (_, i) => i < joined);

  return (
    <div className="circle-details-summary">
      <header className="circle-details-hero">
        <div className="circle-details-hero-glow" aria-hidden />
        <div className="circle-details-hero-top">
          <span className="home-hobby-badge circle-details-hobby-badge" aria-hidden>
            {icon}
          </span>
          {props.hideStatus ? null : (
            <span className={`circle-activity-status-badge circle-details-status--${status}`}>
              {t(statusKey)}
            </span>
          )}
        </div>

        <div className="circle-details-title-copy">
          {props.showEyebrow === false ? null : (
            <p className="circle-details-hero-eyebrow">{t("circleDetails.communityEyebrow")}</p>
          )}
          <BidiText as="h1" className="circle-details-hero-title circle-title-wrap">
            {title}
          </BidiText>
          {identityLine.length ? (
            <p className="circle-details-hero-identity" aria-label={t("circleDetails.identityAria")}>
              {identityLine.map((part, i) => (
                <React.Fragment key={part}>
                  {i > 0 ? <span aria-hidden> · </span> : null}
                  <BidiText>{part}</BidiText>
                </React.Fragment>
              ))}
            </p>
          ) : null}
        </div>

        {props.hideDescription ? null : <p className="circle-details-hero-rhythm">{description}</p>}

        {props.hidePeople ? null : (
        <div className="circle-details-hero-people" aria-label={t("circleDetails.members")}>
          {previewMembers.length ? (
            <div className="circle-details-avatar-stack">
              {previewMembers.map((member) => (
                <CircleMemberAvatar
                  key={member.id}
                  name={memberDisplayName(member, allMembers)}
                  avatarUrl={member.avatarUrl}
                  isYou={member.id === props.myUserId}
                  compact
                />
              ))}
            </div>
          ) : null}
          <div className="circle-details-hero-people-copy">
            {peopleLine ? <BidiText className="circle-details-hero-names">{peopleLine}</BidiText> : null}
            <span className="circle-details-seats" aria-label={t("circleDetails.seatsFilled", { joined, capacity })}>
              <span className="circle-details-seat-dots" aria-hidden>
                {seats.map((filled, i) => (
                  <span key={i} className={filled ? "is-filled" : undefined} />
                ))}
              </span>
              {t("circleDetails.seatsFilled", { joined, capacity })}
            </span>
          </div>
        </div>
        )}

        {props.hideFacts ? null : (
          <ul className="circle-details-hero-facts" aria-label={t("circleDetails.chipsAria")}>
            <li>
              <DetailIcon kind="when" />
              <span>{scheduleChip}</span>
            </li>
            <li>
              <DetailIcon kind="where" />
              <span>{locationChip}</span>
            </li>
            <li>
              <DetailIcon kind="cost" />
              <span>{costChip}</span>
            </li>
          </ul>
        )}
      </header>
    </div>
  );
}

/** "You, Dana and 2 others" — first names only, the viewer first. */
function membersNamesLine(
  members: CircleMemberResponse[],
  myUserId: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!members.length) return null;
  const ordered = [...members].sort((a, b) => Number(b.id === myUserId) - Number(a.id === myUserId));
  const names = ordered.map((m) =>
    m.id === myUserId ? t("circleDetails.you") : memberDisplayName(m, members).split(/\s+/)[0] || "?",
  );
  if (names.length === 1) return names[0];
  if (names.length === 2) return t("circleDetails.namesTwo", { first: names[0], second: names[1] });
  return t("circleDetails.namesMany", { first: names[0], second: names[1], count: names.length - 2 });
}

function DetailIcon(props: { kind: "when" | "where" | "cost" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true as const };
  if (props.kind === "where") {
    return (
      <svg {...common}>
        <path d="M12 2.5c-3.6 0-6.5 2.8-6.5 6.3 0 4.4 5.2 10.1 5.8 10.8a1 1 0 0 0 1.4 0c.6-.7 5.8-6.4 5.8-10.8 0-3.5-2.9-6.3-6.5-6.3zm0 8.6a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6z" />
      </svg>
    );
  }
  if (props.kind === "cost") {
    return (
      <svg {...common}>
        <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm.8 4.2v1.1a2.6 2.6 0 0 1 2.2 1.5h-1.7a1.2 1.2 0 0 0-1.1-.6c-.7 0-1.1.4-1.1.8 0 .5.4.7 1.4.9l.8.2c1.6.4 2.6 1.1 2.6 2.6 0 1.3-.9 2.3-2.3 2.6v1.1h-1.4v-1.1a2.8 2.8 0 0 1-2.4-1.6h1.7c.2.4.6.7 1.2.7.7 0 1.1-.3 1.1-.8s-.4-.7-1.5-1l-.7-.2c-1.5-.4-2.5-1.2-2.5-2.6 0-1.2.9-2.2 2.2-2.5V7.2h1.4z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M7 2.5a1 1 0 0 1 1 1V5h8V3.5a1 1 0 1 1 2 0V5h1.2A2.8 2.8 0 0 1 22 7.8v11.4A2.8 2.8 0 0 1 19.2 22H4.8A2.8 2.8 0 0 1 2 19.2V7.8A2.8 2.8 0 0 1 4.8 5H6V3.5a1 1 0 0 1 1-1zM4 10v9.2c0 .4.4.8.8.8h14.4c.4 0 .8-.4.8-.8V10H4z" />
    </svg>
  );
}

export function CircleDetailsWhyJoin(props: {
  circle: CircleHobyFields & {
    costPayment?: CostPaymentPayload | null;
    groupSize?: GroupSizePayload | null;
  };
  hobiesCatalog?: Hoby[];
}) {
  const { t } = useTranslation();
  const { circle } = props;
  const catalogue = props.hobiesCatalog?.length
    ? findHobyCatalogue(props.hobiesCatalog, circle.ritualType)
    : undefined;
  const typeLevel = catalogue ? circleHobyTypeLevelLabels(circle, catalogue) : null;
  const facts: string[] = [];
  if (circle.isRecurring === false) facts.push(t("circleDetails.factOneTime"));
  else if (circle.recurringTime?.trim()) facts.push(t("circleDetails.factRecurring"));
  if (typeLevel && typeLevel.level !== "—") facts.push(t("circleDetails.factLevel", { level: typeLevel.level }));
  if (circle.modality === "online") facts.push(t("circleDetails.factOnline"));
  else {
    const city = circle.cityName?.trim() || circle.city?.trim();
    if (city) facts.push(t("circleDetails.factCity", { city: city.split(",")[0].trim() }));
  }
  if (circle.costPayment?.type === "free") facts.push(t("circleDetails.factFree"));
  if (!facts.length) return null;

  return (
    <section className="circle-details-why" aria-label={t("circleDetails.whyJoin")}>
      <h3 className="circle-progress-title">{t("circleDetails.whyJoin")}</h3>
      <ul className="circle-details-why-list">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </section>
  );
}

export function CircleDetailsPrimaryAction(props: {
  isMember: boolean;
  joinLabel?: string;
  joinDisabled?: boolean;
  joinBusy?: boolean;
  onJoin?: () => void;
}) {
  const { t } = useTranslation();
  if (props.isMember) return null;

  if (!props.onJoin) return null;

  const label = props.joinBusy
    ? t("circleDetails.joining")
    : props.joinLabel || t("circleDetails.joinThisCircle");

  return (
    <div className="circle-details-cta stack">
      <button
        type="button"
        className="circle-details-primary"
        disabled={props.joinDisabled || props.joinBusy}
        onClick={props.onJoin}
      >
        {label}
      </button>
    </div>
  );
}

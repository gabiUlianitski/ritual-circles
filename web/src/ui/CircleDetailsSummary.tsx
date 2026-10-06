import React from "react";
import { useTranslation } from "react-i18next";
import type { CostPaymentPayload, GroupSizePayload, Hoby } from "../api/types";
import { circleHobyTitle, type CircleHobyFields } from "./circleDisplay";
import {
  formatCircleCostChip,
  formatCircleLocationChip,
  formatCircleScheduleChip,
} from "./circleDetailsFormat";
import { activityStatusMark, circleMomentum } from "./CircleProgressCard";
import { circleHobyTypeLevelLabels, findHobyCatalogue } from "./memberHobbyLevel";

export function CircleDetailsSummary(props: {
  circle: CircleHobyFields & {
    modality?: string;
    costPayment?: CostPaymentPayload | null;
    groupSize?: GroupSizePayload | null;
    maxSize?: number;
  };
  hobiesCatalog?: Hoby[];
  memberCount?: number;
  maxSize?: number;
  hasNextSession?: boolean;
}) {
  const { t } = useTranslation();
  const { circle } = props;
  const catalogue = props.hobiesCatalog?.length
    ? findHobyCatalogue(props.hobiesCatalog, circle.ritualType)
    : undefined;

  const title = circleHobyTitle(circle);
  const typeLevel = catalogue ? circleHobyTypeLevelLabels(circle, catalogue) : null;
  const level = typeLevel && typeLevel.level !== "—" ? typeLevel.level : null;
  const description = catalogue?.shortDescription?.trim() || "";
  const icon = circle.hobyIcon?.trim() || catalogue?.icon?.trim() || "";
  const scheduleChip = formatCircleScheduleChip(circle, t);
  const locationChip = formatCircleLocationChip(circle, t);
  const costChip = formatCircleCostChip(circle.costPayment, circle.groupSize, t);
  const joined = Math.max(0, props.memberCount ?? 0);
  const capacity = Math.max(1, props.maxSize ?? circle.maxSize ?? 6);
  const status = circleMomentum(joined, capacity, Boolean(props.hasNextSession));
  const statusKey = {
    justStarted: "circleDetails.statusJustStarted",
    growing: "circleDetails.statusGrowing",
    almostReady: "circleDetails.statusAlmostReady",
    readyToSchedule: "circleDetails.statusReadyToSchedule",
    meetingConfirmed: "circleDetails.statusMeetingConfirmed",
  }[status];

  return (
    <div className="circle-details-summary stack">
      <header className="circle-details-hero">
        <div className="circle-details-title-row">
          <span className="home-hobby-badge circle-details-hobby-badge" aria-hidden>
            {icon}
          </span>
          <div className="circle-details-title-copy">
            <h2 className="circle-details-hero-title">{level ? `${level} ${title}` : title}</h2>
            <p className="circle-activity-status">
              <span className="circle-activity-status-kicker">{t("circleDetails.activityStatus")}</span>
              <span className={`circle-activity-status-badge circle-progress-status--${status}`}>
                <span aria-hidden>{activityStatusMark(status)}</span>
                {t(statusKey)}
              </span>
            </p>
            {description ? <p className="circle-details-hero-rhythm">{description}</p> : null}
          </div>
        </div>
      </header>

      <ul className="circle-details-facts" aria-label={t("circleDetails.chipsAria")}>
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
    </div>
  );
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

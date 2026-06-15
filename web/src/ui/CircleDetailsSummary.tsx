import React from "react";
import { useTranslation } from "react-i18next";
import type { CostPaymentPayload, GroupSizePayload, Hoby } from "../api/types";
import { type CircleHobyFields } from "./circleDisplay";
import {
  formatCircleCostChip,
  formatCircleDetailsRhythm,
  formatCircleDetailsTitle,
  formatCircleDetailsVibe,
  formatCircleLocationChip,
  formatCircleScheduleChip,
  formatCircleSizeChip,
} from "./circleDetailsFormat";
import { findHobyCatalogue } from "./memberHobbyLevel";

export function CircleDetailsSummary(props: {
  circle: CircleHobyFields & {
    modality?: string;
    costPayment?: CostPaymentPayload | null;
    groupSize?: GroupSizePayload | null;
  };
  hobiesCatalog?: Hoby[];
  memberCount?: number;
  maxSize?: number;
}) {
  const { t } = useTranslation();
  const { circle } = props;
  const catalogue = props.hobiesCatalog?.length
    ? findHobyCatalogue(props.hobiesCatalog, circle.ritualType)
    : undefined;

  const title = formatCircleDetailsTitle(circle, catalogue, t);
  const rhythm = formatCircleDetailsRhythm(circle, t);
  const vibe = formatCircleDetailsVibe(circle.ritualType, t);
  const scheduleChip = formatCircleScheduleChip(circle, t);
  const locationChip = formatCircleLocationChip(circle, t);
  const costChip = formatCircleCostChip(circle.costPayment, circle.groupSize, t);
  const sizeChip = formatCircleSizeChip(props.memberCount ?? 0, props.maxSize ?? circle.maxSize ?? 6, t);

  return (
    <div className="circle-details-summary stack">
      <header className="circle-details-hero">
        <h2 className="circle-details-hero-title">{title}</h2>
        <p className="circle-details-hero-rhythm">{rhythm}</p>
        <p className="circle-details-hero-vibe muted">{vibe}</p>
      </header>

      <div className="circle-details-chips" aria-label={t("circleDetails.chipsAria")}>
        <div className="circle-details-chip-row">
          <span className="circle-details-chip">📅 {scheduleChip}</span>
          <span className="circle-details-chip">📍 {locationChip}</span>
        </div>
        <div className="circle-details-chip-row">
          <span className="circle-details-chip">💸 {costChip}</span>
          <span className="circle-details-chip">👥 {sizeChip}</span>
        </div>
      </div>
    </div>
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

  const joinLabel = t("discoverPage.join");
  const blocked =
    props.joinLabel &&
    props.joinLabel !== joinLabel &&
    props.joinLabel !== t("discoverPage.joinThisCircle");

  return (
    <div className="circle-details-cta stack">
      <button
        type="button"
        className={blocked ? "circle-details-cta-btn circle-details-cta-btn-secondary" : "primary circle-details-cta-btn"}
        disabled={props.joinDisabled || props.joinBusy}
        onClick={props.onJoin}
      >
        {props.joinBusy
          ? t("circleDetails.joining")
          : blocked
            ? props.joinLabel
            : t("circleDetails.joinThisCircle")}
      </button>
    </div>
  );
}
